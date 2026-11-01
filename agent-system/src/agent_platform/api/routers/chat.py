from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, UUID4
from agent_platform.harness.persistence.ports import PersistenceError
from agent_platform.harness.state.principal import Principal
from agent_platform.api.deps import get_optional_principal, owned_thread
from agent_platform.api.sse import format_sse_event
from agent_platform.harness.guards.pii import PIIMasker

router = APIRouter(prefix="/v1", tags=["Chat"])

class ChatRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    thread_id: Optional[str] = Field(default=None, max_length=128)
    operation_id: Optional[UUID4] = None

class ChatResponse(BaseModel):
    thread_id: str
    run_id: str
    final_answer: Optional[str]
    status: str
    grounding_score: Optional[float]
    grounding_status: Optional[str] = None
    citations: list[str] = []

@router.post("/chat", response_model=ChatResponse)
async def chat_endpoint(
    req: ChatRequest,
    request: Request,
    principal: Principal = Depends(get_optional_principal),
):
    """Synchronous JSON chat endpoint."""
    harness = request.app.state.harness
    thread_id = await owned_thread(request, principal, req.thread_id)
    try:
        state = await harness.execute(
            query=req.query,
            principal=principal,
            thread_id=thread_id,
            **({"operation_id": str(req.operation_id)} if req.operation_id else {}),
        )
    except PermissionError:
        raise HTTPException(status_code=404, detail="Chat session not found.")
    except PersistenceError:
        raise HTTPException(
            status_code=503,
            detail="Durable persistence store unavailable; operation outcome may be unknown. Check its status before retrying.",
        )

    citations = [ev.source_document for ev in (state.get("matched_evidence", []) if state.get("status") == "done" else [])]
    return ChatResponse(
        thread_id=state["thread_id"],
        run_id=state["run_id"],
        final_answer=state.get("final_answer"),
        status=state.get("status", "unknown"),
        grounding_score=state.get("grounding_score"),
        grounding_status=state.get("grounding_status"),
        citations=list(dict.fromkeys(citations)),
    )

@router.post("/chat/stream")
async def chat_stream_endpoint(
    req: ChatRequest,
    request: Request,
    principal: Principal = Depends(get_optional_principal),
):
    """Server-Sent Events (SSE) streaming chat endpoint."""
    harness = request.app.state.harness
    thread_id = await owned_thread(request, principal, req.thread_id)

    async def sse_generator():
        # Mask query in SSE run.started event
        yield format_sse_event("run.started", {"query": PIIMasker.mask(req.query, fail_closed=False), "user_id": principal.user_id, "thread_id": thread_id})

        try:
            state = await harness.execute(
                query=req.query,
                principal=principal,
                thread_id=thread_id,
                **({"operation_id": str(req.operation_id)} if req.operation_id else {}),
            )
        except PersistenceError:
            yield format_sse_event(
                "run.error",
                {
                    "status": "persistence_error",
                    "detail": "Durable persistence store unavailable; operation outcome may be unknown. Check its status before retrying.",
                },
            )
            return

        if state.get("final_answer"):
            yield format_sse_event("answer.final", {"text": state["final_answer"]})

        citations = [ev.source_document for ev in (state.get("matched_evidence", []) if state.get("status") == "done" else [])]
        if citations:
            yield format_sse_event("citations", {"sources": list(dict.fromkeys(citations))})

        yield format_sse_event("run.done", {"status": state.get("status", "done"), "grounding_status": state.get("grounding_status")})

    return StreamingResponse(sse_generator(), media_type="text/event-stream")
