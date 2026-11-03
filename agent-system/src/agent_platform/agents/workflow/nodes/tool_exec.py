import json
import time
from typing import List, Dict, Any
from langchain_core.messages import ToolMessage
from agent_platform.harness.state.contracts import AgentState, Evidence, ToolEvent
from agent_platform.harness.tools.executor import ToolExecutor
from agent_platform.harness.guards.pii import PIIMasker

def create_tool_exec_node(executor: ToolExecutor):
    """Factory creating the tool execution node."""

    async def tool_exec_node(state: AgentState) -> dict:
        pending_calls = state.get("pending_tool_calls", [])
        if not pending_calls:
            return {}

        if len(pending_calls) > 1 and getattr(executor, "registry", None) and any(
            executor.registry.get(call.get("name", "")) and executor.registry.get(call.get("name", "")).side_effect
            for call in pending_calls
        ):
            return {"pending_tool_calls": [], "status": "abstained", "verified_commerce_answer": None,
                    "final_answer": "Vui lòng thực hiện từng thao tác riêng để có thể xác nhận kết quả."}

        principal = state["principal"]
        thread_id = state.get("thread_id", "thread_default")
        run_id = state.get("run_id", "run_default")

        tool_messages: List[ToolMessage] = []
        events: List[ToolEvent] = []
        new_evidence: List[Evidence] = []
        awaiting_approval = False
        unavailable_message = None
        unknown_outcome = False
        approval_call = None
        verified_commerce_answer = None

        for tc in pending_calls:
            t_start = time.time()
            tool_name = tc.get("name", "")
            args = tc.get("arguments", {})
            call_id = tc.get("id", f"call_{len(tool_messages)}")

            registry = getattr(executor, "registry", None)
            spec = registry.get(tool_name) if registry else None
            if state.get("require_operation_id") and spec and spec.side_effect and not state.get("operation_id"):
                unavailable_message = "Không thể thực hiện thao tác vì thiếu mã yêu cầu. Vui lòng gửi lại từ giao diện hỗ trợ mã thao tác."
                break

            result = await executor.execute(
                tool_name=tool_name,
                arguments=args,
                principal=principal,
                thread_id=thread_id,
                call_id=call_id,
                run_id=run_id,
                operation_id=state.get("operation_id"),
            )

            duration_ms = (time.time() - t_start) * 1000

            if result.requires_approval:
                awaiting_approval = True
                # Preserve only the reviewable, non-PII subset. This is not an
                # executable payload; the original tool input is not retained here.
                approval_call = {
                    "name": tool_name,
                    "id": call_id,
                    "arguments": {k: str(args[k]) for k in ("order_id", "amount") if k in args},
                    "rule": result.approval_metadata.get("rule"),
                }

            # ToolExecutor already produced masked output in wrapped_output
            masked_output_str = str(result.output)
            if len(pending_calls) == 1 and not result.is_error and result.commerce_answer:
                verified_commerce_answer = result.commerce_answer

            tool_msg = ToolMessage(
                content=(masked_output_str + "\nCâu trả lời nghiệp vụ đã được kiểm tra: " + verified_commerce_answer
                         if verified_commerce_answer else masked_output_str),
                tool_call_id=call_id,
                name=tool_name,
            )
            tool_messages.append(tool_msg)

            # Mask arguments and output stored in ToolEvent
            events.append(ToolEvent(
                tool_name=tool_name,
                call_id=call_id,
                arguments={} if result.requires_approval else PIIMasker.mask(args, fail_closed=False),
                output=masked_output_str[:500],
                is_error=result.is_error,
                execution_time_ms=duration_ms,
            ))

            if awaiting_approval:
                break

            if result.error_code == "sensitive_input_unavailable":
                unavailable_message = masked_output_str
                break

            spec = registry.get(tool_name) if registry else None
            if result.is_error and spec and spec.side_effect:
                unknown_outcome = result.error_code in ("unknown_outcome", "idempotency_in_progress")
                unavailable_message = ("Chưa xác định được kết quả thao tác; cần đối soát trước khi thử lại."
                                       if unknown_outcome else "Thao tác thất bại hoặc chưa được gửi; chưa có thay đổi được xác nhận.")
                break

            if result.error_code in ("unavailable", "timeout", "unknown_outcome", "idempotency_in_progress"):
                unavailable_message = masked_output_str
                unknown_outcome = result.error_code == "unknown_outcome"
                break

            # If search_knowledge executed successfully, attach verified policy evidence
            if tool_name == "search_knowledge" and not result.is_error:
                try:
                    raw_content = str(result.output)
                    if "<tool_output" in raw_content:
                        json_str = raw_content.split("<tool_output name=\"search_knowledge\">\n", 1)[-1].rsplit("\n</tool_output>", 1)[0]
                        parsed_res = json.loads(json_str)
                        if isinstance(parsed_res, dict) and parsed_res.get("source_verified"):
                            version = parsed_res.get("document_version_id", "MWG-POLICY-2026.1")
                            for item in parsed_res.get("results", []):
                                new_evidence.append(Evidence(
                                    chunk_id=str(item.get("id", f"chunk_{len(new_evidence)}")),
                                    source_document=str(item.get("source_document") or item.get("title", "policy.md")),
                                    document_version_id=version,
                                    content_snippet=str(item.get("snippet") or item.get("content", ""))[:500],
                                    source_verified=True,
                                ))
                except Exception:
                    pass

        updates: Dict[str, Any] = {
            "messages": tool_messages,
            "pending_tool_calls": [],
            "tool_events": events,
            "evidence": new_evidence,
            "verified_commerce_answer": verified_commerce_answer,
        }

        if unavailable_message:
            updates["status"] = "unknown_outcome" if unknown_outcome else "abstained"
            updates["final_answer"] = unavailable_message
        elif awaiting_approval:
            updates["status"] = "awaiting_approval"
            updates["approval_call"] = approval_call
        elif verified_commerce_answer:
            # Render a validated Core result directly; a second model turn must
            # neither paraphrase it nor invent additional business claims.
            updates["final_answer"] = verified_commerce_answer
            updates["grounding_status"] = "verified_commerce"
            updates["grounding_score"] = None
            updates["matched_evidence"] = []
            updates["status"] = "done"

        return updates

    return tool_exec_node
