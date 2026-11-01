import uuid
from typing import Dict, Any, AsyncIterator, Optional
from langchain_core.messages import HumanMessage
from agent_platform.harness.state.contracts import AgentState
from agent_platform.harness.state.principal import Principal

class OrchestratorRunner:
    """Orchestrates compiled LangGraph execution sessions."""

    def __init__(self, compiled_graph) -> None:
        self.graph = compiled_graph

    async def execute(
        self,
        query: str,
        principal: Principal,
        thread_id: Optional[str] = None,
        run_id: Optional[str] = None,
        memory_context: Optional[str] = None,
        operation_id: Optional[str] = None,
        require_operation_id: bool = False,
    ) -> AgentState:
        session_thread_id = thread_id or f"thread_{uuid.uuid4().hex[:12]}"
        session_run_id = run_id or f"run_{uuid.uuid4().hex[:8]}"

        initial_state: AgentState = {
            "thread_id": session_thread_id,
            "run_id": session_run_id,
            "operation_id": operation_id,
            "require_operation_id": require_operation_id,
            "principal": principal,
            "domain": "default",
            "prompt_version": "v3",
            "messages": [HumanMessage(content=query)],
            "step_count": 0,
            "critic_cycles": 0,
            "critic_feedback": None,
            "evidence": [],
            "tool_events": [],
            "pending_tool_calls": [],
            "approval_call": None,
            "final_answer": None,
            "grounding_score": None,
            "grounding_status": None,
            "matched_evidence": [],
            "verified_commerce_answer": None,
            "memory_context": memory_context,
            "status": "running",
        }

        config = {"configurable": {"thread_id": session_thread_id}}
        final_state = await self.graph.ainvoke(initial_state, config=config)
        return final_state

# Backward-compatible alias
AgentRunner = OrchestratorRunner
