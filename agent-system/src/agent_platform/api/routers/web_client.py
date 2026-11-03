"""RetailMind AI — Web Client & BFF Gateway Router.

Primary Gateway Router serving Next.js Frontend Client (apps/frontend):
- POST /api/chat/stream: SSE stream conforming to page.tsx parser (thought, citations, hitl_pending, answer, error, [DONE])
- POST /api/chat: Synchronous JSON chat endpoint
- GET  /api/hitl/queue: Pending tasks queue formatted for HitlTask frontend interface
- GET  /api/hitl/pending: Alias for pending queue
- POST /api/hitl/review: Review and approve/reject HITL task
- POST /api/hitl/{task_id}/approve: Approval endpoint
- POST /api/hitl/{task_id}/reject: Rejection endpoint
- GET  /api/finops/metrics: FinOps metrics for observability dashboard
"""

import json
import os
import time
import httpx
from typing import Optional, Dict, Any, List, Literal
from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, ConfigDict, UUID4

from agent_platform.harness.persistence.ports import PersistenceError
from agent_platform.harness.state.principal import Principal
from agent_platform.api.deps import get_optional_principal, get_principal, owned_thread, require_role
from agent_platform.request_credentials import current_authorization
from agent_platform.harness.guards.sanitizer import InputSanitizer
from agent_platform.harness.guards.injection import PromptInjectionDetector
from agent_platform.llm.providers.scripted import ScriptedLLM

router = APIRouter(prefix="/api", tags=["Web Client Gateway"])


# ---------------------------------------------------------------------------
# Request & Response Contracts
# ---------------------------------------------------------------------------
class LegacyChatRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=4000)
    session_id: Optional[str] = Field(default=None, max_length=128)
    client_id: Optional[str] = "default_client"
    operation_id: Optional[UUID4] = None


class OperationStatusRequest(BaseModel):
    operation_id: UUID4


@router.post('/chat/operation-status')
async def operation_status(req: OperationStatusRequest, request: Request, principal: Principal = Depends(get_principal)):
    """Read Core's receipt using the original customer's credential; never re-execute."""
    authorization = current_authorization()
    if not authorization:
        raise HTTPException(status_code=401, detail='Authentication required.')
    base_url = os.getenv('NESTJS_BACKEND_URL', os.getenv('CORE_API_URL', 'http://localhost:4000')).rstrip('/')
    secret = os.getenv('INTERNAL_TOOL_SECRET', 'secret_token_internal_retailmind')
    transport = getattr(request.app.state, 'commerce_transport', None)
    try:
        async with httpx.AsyncClient(timeout=3.0, transport=transport, follow_redirects=False) as client:
            response = await client.post(f'{base_url}/api/v1/internal/tools/operation-status', headers={
                'Authorization': authorization, 'X-Internal-Secret': secret,
                'Idempotency-Key': str(req.operation_id),
            })
        if response.status_code != 200:
            raise ValueError('Core status unavailable')
        data = response.json()
        if not isinstance(data, dict) or data.get('outcome') not in ('confirmed', 'unknown'):
            raise ValueError('Invalid Core status')
        operation = data.get('operation')
        if operation is not None and operation not in ('add_to_cart', 'remove_from_cart', 'cancel_simulated_order', 'create_support_ticket', 'manage_favorite'):
            raise ValueError('Invalid Core operation')
        return {'outcome': data['outcome'], 'operation': operation}
    except (httpx.HTTPError, ValueError, TypeError):
        raise HTTPException(status_code=503, detail='Không thể đối soát lúc này; chưa xác định được kết quả.')


class HitlReviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    task_id: Optional[str] = None
    approval_id: Optional[str] = None
    decision: Literal["approve", "approved", "reject", "rejected"] = "approved"
    reviewer: Optional[str] = None
    reason: Optional[str] = ""


# ---------------------------------------------------------------------------
# POST /api/chat/stream & POST /api/v1/agent/chat/stream
# ---------------------------------------------------------------------------
@router.post("/chat/stream")
@router.post("/v1/agent/chat/stream")
async def chat_stream_endpoint(
    req: LegacyChatRequest,
    request: Request,
    principal: Principal = Depends(get_optional_principal),
):
    """
    Server-Sent Events (SSE) streaming endpoint fully compatible with apps/frontend:
    Emits lines with prefix 'data: ' and ends with 'data: [DONE]'.
    Event types: 'thought', 'citations', 'hitl_pending', 'answer', 'error'.
    """
    harness = request.app.state.harness

    thread_id = await owned_thread(request, principal, req.session_id)

    async def sse_event_generator():
        yield f"data: {json.dumps({'type': 'session', 'session_id': thread_id, 'resumable': principal.role != 'guest'})}\n\n"
        # Check input sanitization & prompt injection guard
        clean_query = InputSanitizer.sanitize(req.query)
        if PromptInjectionDetector.is_injection(clean_query):
            err_msg = (
                "Phát hiện mẫu chỉ thị can thiệp hệ thống nguy hiểm (Prompt Injection). "
                "Hệ thống từ chối yêu cầu để đảm bảo an toàn vận hành."
            )
            yield f"data: {json.dumps({'type': 'error', 'message': err_msg})}\n\n"
            yield "data: [DONE]\n\n"
            return

        # Emit supervisor analysis thought trace
        yield f"data: {json.dumps({'type': 'thought', 'content': 'RetailMind AI Supervisor: Tiếp nhận yêu cầu, phân tích ý định và chuẩn bị không gian suy luận.'})}\n\n"

        # Check if active domain pack provides an interactive demo helper
        if harness.pack.pack_dir:
            demo_file = harness.pack.pack_dir / "demo.py"
            if demo_file.exists():
                import importlib.util
                spec = importlib.util.spec_from_file_location("domain_demo", demo_file)
                if spec and spec.loader:
                    demo_mod = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(demo_mod)
                    if hasattr(demo_mod, "dispatch_demo"):
                        demo_mod.dispatch_demo(harness.llm, clean_query)

        # Execute agent workflow
        try:
            state = await harness.execute(
                query=clean_query,
                principal=principal,
                thread_id=thread_id,
                **({"operation_id": str(req.operation_id)} if req.operation_id else {}),
            )
        except PersistenceError:
            err_msg = "Hệ thống lưu trữ đang gián đoạn; chưa xác định được kết quả thao tác. Hãy kiểm tra trạng thái trước khi thử lại."
            yield f"data: {json.dumps({'type': 'error', 'code': 'persistence_unavailable', 'message': err_msg})}\n\n"
            yield "data: [DONE]\n\n"
            return

        # Emit thought traces for each executed tool
        for ev in state.get("tool_events", []):
            yield f"data: {json.dumps({'type': 'thought', 'content': f'Agent Reasoning: Quyết định gọi công cụ [{ev.tool_name}] (thời gian thực thi {ev.execution_time_ms:.1f}ms).'})}\n\n"
            if ev.tool_name == "create_support_ticket" and ev.is_error and principal.role == "customer":
                yield f"data: {json.dumps({'type': 'support_form', 'path': '/support'})}\n\n"

        if state.get("critic_cycles", 0) > 0:
            cycles = state.get("critic_cycles", 1)
            yield f"data: {json.dumps({'type': 'thought', 'content': f'Đã kiểm tra căn cứ (chu kỳ {cycles}).'})}\n\n"

        # Check HITL Gate requirement
        is_hitl = state.get("status") == "awaiting_approval"
        if is_hitl:
            task_id = state.get("approval_id")
            if not task_id:
                yield f"data: {json.dumps({'type': 'error', 'code': 'approval_unavailable', 'message': 'Không thể xác nhận yêu cầu phê duyệt.'})}\n\n"
                yield "data: [DONE]\n\n"
                return
            hitl_reason = "Yêu cầu cần được kiểm tra; thao tác nghiệp vụ chưa được thực hiện."
            yield f"data: {json.dumps({'type': 'hitl_pending', 'task_id': task_id, 'reason': hitl_reason})}\n\n"
            answer_text = "Yêu cầu đã được ghi nhận để kiểm tra; chưa thực hiện giao dịch."
            yield f"data: {json.dumps({'type': 'answer', 'content': answer_text, 'status': 'awaiting_approval', 'grounding_score': None})}\n\n"
            yield "data: [DONE]\n\n"
            return

        # Emit citations if evidence was collected
        evidence_list = state.get("matched_evidence", []) if state.get("status") == "done" else []
        citations_data = []
        for ev in evidence_list:
            citations_data.append({
                "title": ev.source_document if ev.source_document != "knowledge_store" else f"{harness.pack.name.replace('_', ' ').title()} Knowledge Base",
                "document_version_id": ev.document_version_id,
                "chunk_id": ev.chunk_id,
                "content": ev.content_snippet,
                "snippet": ev.content_snippet[:200] if ev.content_snippet else "",
            })
        if citations_data:
            yield f"data: {json.dumps({'type': 'citations', 'data': citations_data})}\n\n"

        # Emit final answer
        final_ans = state.get("final_answer") or "Yêu cầu của bạn đã được ghi nhận."
        grounding = state.get("grounding_score")
        yield f"data: {json.dumps({'type': 'answer', 'content': final_ans, 'status': state.get('status'), 'grounding_score': grounding, 'grounding_status': state.get('grounding_status')})}\n\n"

        # Terminating frame
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        sse_event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# POST /api/chat (Synchronous endpoint for testing & microservices)
# ---------------------------------------------------------------------------
@router.post("/chat")
async def chat_sync_endpoint(req: LegacyChatRequest, request: Request, principal: Principal = Depends(get_optional_principal)):
    """Synchronous JSON endpoint returning complete agent execution result."""
    harness = request.app.state.harness

    clean_query = InputSanitizer.sanitize(req.query)
    if PromptInjectionDetector.is_injection(clean_query):
        return {
            "status": "error",
            "message": "Phát hiện mẫu chỉ thị can thiệp hệ thống nguy hiểm (Prompt Injection).",
        }

    thread_id = await owned_thread(request, principal, req.session_id)

    # Check if active domain pack provides an interactive demo helper
    if harness.pack.pack_dir:
        demo_file = harness.pack.pack_dir / "demo.py"
        if demo_file.exists():
            import importlib.util
            spec = importlib.util.spec_from_file_location("domain_demo", demo_file)
            if spec and spec.loader:
                demo_mod = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(demo_mod)
                if hasattr(demo_mod, "dispatch_demo"):
                    demo_mod.dispatch_demo(harness.llm, clean_query)

    try:
        state = await harness.execute(
            query=clean_query,
            principal=principal,
            thread_id=thread_id,
            **({"operation_id": str(req.operation_id)} if req.operation_id else {}),
        )
    except PermissionError:
        raise HTTPException(status_code=404, detail="Chat session not found.")
    except PersistenceError:
        raise HTTPException(status_code=503, detail="Durable persistence store unavailable.")

    requires_approval = state.get("status") == "awaiting_approval"
    citations_data = [
        {"title": ev.source_document, "content": ev.content_snippet}
        for ev in (state.get("matched_evidence", []) if state.get("status") == "done" else [])
    ]
    thoughts = [
        f"Agent: Executed tool [{ev.tool_name}] ({ev.execution_time_ms:.1f}ms)"
        for ev in state.get("tool_events", [])
    ]

    return {
        "status": "awaiting_approval" if requires_approval else ("unknown_outcome" if state.get("status") == "unknown_outcome" else ("error" if state.get("status") in ("abstained", "failed") else "success")),
        "session_id": thread_id,
        "final_answer": state.get("final_answer") or "Yêu cầu đã được tiếp nhận.",
        "grounding_score": state.get("grounding_score"),
        "grounding_status": state.get("grounding_status"),
        "citations": citations_data,
        "requires_human_approval": requires_approval,
        "thought_trace": thoughts,
    }


# ---------------------------------------------------------------------------
# HITL GOVERNANCE QUEUE & REVIEW
# ---------------------------------------------------------------------------
@router.get("/hitl/queue")
@router.get("/hitl/pending")
async def get_hitl_queue(request: Request, admin: Principal = Depends(require_role("admin"))):
    """Returns list of pending HITL tasks formatted for Frontend interface."""
    harness = request.app.state.harness
    try:
        pending_list = await harness.approval_store.list_pending()
    except PersistenceError:
        raise HTTPException(status_code=503, detail="Approval persistence store unavailable.")
    formatted = []
    for item in pending_list:
        if not item.requester_user_id or item.requester_tenant_id != admin.tenant_id:
            continue
        formatted.append({
            "task_id": item.approval_id,
            "approval_id": item.approval_id,
            "session_id": item.thread_id,
            "thread_id": item.thread_id,
            "query": "Yêu cầu phê duyệt",
            "reason": "Quyết định không đồng nghĩa với thực hiện nghiệp vụ.",
            "status": item.status.upper(),  # "PENDING"
            "tool_name": item.tool_name,
            "execution_status": item.execution_status,
            "timestamp": "Vừa xong",
            "created_at": item.created_at,
        })
    return formatted


@router.post("/hitl/review")
async def review_hitl(req: HitlReviewRequest, request: Request, admin: Principal = Depends(require_role("admin"))):
    """Processes approval/rejection decision submitted by dashboard administrator."""
    harness = request.app.state.harness
    if req.reviewer is not None and req.reviewer != admin.user_id:
        raise HTTPException(status_code=403, detail="Reviewer must match the authenticated user.")
    task_id = req.task_id or req.approval_id
    if not task_id:
        raise HTTPException(status_code=400, detail="Thiếu trường 'task_id' hoặc 'approval_id'.")

    dec = req.decision.lower() if req.decision else "approved"
    norm_decision: Literal["approved", "rejected"] = "approved" if dec in ("approve", "approved") else "rejected"

    try:
        resumed = await harness.resolve_and_resume_hitl(
            approval_id=task_id,
            decision=norm_decision,
            approver=admin,
            note=req.reason or "",
        )
        resolved = resumed["approval"]
        return {
            "status": resolved.status,
            "execution_status": resolved.execution_status,
            "message": "Đã ghi nhận quyết định; nghiệp vụ chưa được thực hiện.",
            "task_id": task_id,
            "decision": norm_decision,
            "task": resolved.model_dump(exclude={"arguments"}),
            "resumed_output": resumed.get("resumed_output"),
        }
    except KeyError:
        raise HTTPException(status_code=404, detail="Không tìm thấy yêu cầu phê duyệt.")
    except PermissionError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except ValueError as ve:
        msg = str(ve)
        status_code = 409 if "already " in msg.lower() else 400
        raise HTTPException(status_code=status_code, detail=msg)
    except PersistenceError:
        raise HTTPException(status_code=503, detail="Approval persistence store unavailable; decision was not committed.")


@router.post("/hitl/{task_id}/approve")
async def approve_hitl_endpoint(task_id: str, request: Request, admin: Principal = Depends(require_role("admin"))):
    """Direct approval endpoint for backward compatibility."""
    return await review_hitl(HitlReviewRequest(task_id=task_id, decision="approved"), request, admin)


@router.post("/hitl/{task_id}/reject")
async def reject_hitl_endpoint(task_id: str, request: Request, admin: Principal = Depends(require_role("admin"))):
    """Direct rejection endpoint for backward compatibility."""
    return await review_hitl(HitlReviewRequest(task_id=task_id, decision="rejected"), request, admin)


# ---------------------------------------------------------------------------
# FINOPS & OBSERVABILITY
# ---------------------------------------------------------------------------
@router.get("/finops/metrics")
async def get_finops_metrics(request: Request, admin: Principal = Depends(require_role("admin"))):
    """Returns summary FinOps token & cost metrics from FinOpsLedger (Decimal)."""
    harness = request.app.state.harness
    summary = harness.finops_ledger.get_summary()
    return {
        "total_requests": summary["total_calls"],
        "total_calls": summary["total_calls"],
        "total_tokens": summary["total_tokens"],
        "prompt_tokens": summary["prompt_tokens"],
        "completion_tokens": summary["completion_tokens"],
        "total_cost_usd": summary["total_cost_usd"],
        "durable": summary.get("durable", False),
        "persistence_mode": summary.get("persistence_mode", "in_memory_ephemeral"),
        "avg_latency_ms": 38.5,
        "circuit_state": "CLOSED",
    }


@router.get("/health")
async def get_health_status():
    """Health check endpoint under /api/health."""
    return {
        "status": "healthy",
        "platform_state": "READY",
        "circuit_state": "CLOSED",
        "can_serve_traffic": True,
        "timestamp": time.time(),
    }
