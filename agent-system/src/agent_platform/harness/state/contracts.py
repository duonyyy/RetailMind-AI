from typing import Annotated, List, Dict, Any, Optional, Literal
from typing_extensions import TypedDict
import operator
from pydantic import BaseModel, Field
from langchain_core.messages import AnyMessage
from langgraph.graph.message import add_messages
from agent_platform.harness.state.principal import Principal

class Evidence(BaseModel):
    chunk_id: str
    source_document: str
    content_snippet: str
    score: Optional[float] = None
    source_verified: bool = False
    document_version_id: Optional[str] = None

class ToolEvent(BaseModel):
    tool_name: str
    call_id: str
    arguments: Dict[str, Any] = Field(default_factory=dict)
    output: str
    is_error: bool = False
    execution_time_ms: float = 0.0

class AgentState(TypedDict):
    """
    Unified state representation for the enterprise cyclic agent workflow.
    Managed by LangGraph with strict reducers.
    """
    # Immutable session context attached at API gateway
    thread_id: str
    run_id: str
    operation_id: Optional[str]
    require_operation_id: bool
    principal: Principal
    domain: str
    prompt_version: str

    # Conversation trajectory
    messages: Annotated[List[AnyMessage], add_messages]

    # Control variables & loop limits
    step_count: int
    critic_cycles: int
    critic_feedback: Optional[str]

    # Accumulated factual evidence & tool executions
    evidence: Annotated[List[Evidence], operator.add]
    tool_events: Annotated[List[ToolEvent], operator.add]

    # Pending tool calls to be processed by tool_gate / tool_exec
    pending_tool_calls: List[Dict[str, Any]]
    approval_call: Optional[Dict[str, Any]]

    # Final outputs and termination status
    final_answer: Optional[str]
    grounding_score: Optional[float]
    grounding_status: Optional[str]
    matched_evidence: List[Evidence]
    verified_commerce_answer: Optional[str]
    memory_context: Optional[str]
    status: Literal["running", "awaiting_approval", "done", "abstained", "failed", "unknown_outcome"]
