from typing import Protocol, AsyncIterator, List, Dict, Any, Optional, runtime_checkable
from pydantic import BaseModel, Field

class LLMUnavailableError(RuntimeError):
    """The configured model could not produce a verified provider response."""

class ToolCall(BaseModel):
    id: str
    name: str
    arguments: Dict[str, Any] = Field(default_factory=dict)

class Usage(BaseModel):
    prompt_tokens: int = 0
    cached_prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0

class LLMResponse(BaseModel):
    content: Optional[str] = None
    tool_calls: List[ToolCall] = Field(default_factory=list)
    usage: Usage = Field(default_factory=Usage)
    model: str = "unknown"
    provider: str = "unknown"

class LLMChunk(BaseModel):
    delta_content: Optional[str] = None
    tool_call_delta: Optional[Dict[str, Any]] = None
    usage: Optional[Usage] = None

@runtime_checkable
class LLMPort(Protocol):
    """Abstract protocol for all LLM providers in the platform."""

    async def complete(
        self,
        messages: List[Dict[str, Any]],
        *,
        tools: Optional[List[Dict[str, Any]]] = None,
        temperature: float = 0.0,
        max_tokens: int = 2048,
    ) -> LLMResponse:
        """Executes non-streaming completion with native tool calling."""
        ...

    def stream(
        self,
        messages: List[Dict[str, Any]],
        *,
        tools: Optional[List[Dict[str, Any]]] = None,
        temperature: float = 0.0,
    ) -> AsyncIterator[LLMChunk]:
        """Executes streaming completion yielding LLMChunk deltas."""
        ...
