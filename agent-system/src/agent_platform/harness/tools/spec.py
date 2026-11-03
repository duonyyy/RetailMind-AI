from typing import Callable, Any, Dict, List, Optional, Type
from pydantic import BaseModel, ConfigDict
from agent_platform.harness.state.principal import Principal

class ToolUnavailableError(Exception):
    """A trusted source did not confirm the requested operation."""

class ConfirmedOrderStatus(dict):
    """Internal marker produced only after the Core order-status contract is validated."""

class ConfirmedCatalogRead(dict):
    """Internal marker produced after validating a Core catalog response."""

class ConfirmedCartRead(dict):
    """Internal marker produced after validating a customer-scoped Core cart."""

class ConfirmedInventoryRead(dict):
    """Internal marker produced after validating Core inventory identity and quantity."""

class ToolContext(BaseModel):
    """Contextual metadata injected by server into tool execution."""
    principal: Principal
    idempotency_key: str
    thread_id: str
    run_id: str
    http_client: Any = None
    outcome_ambiguous: bool = False

    model_config = ConfigDict(arbitrary_types_allowed=True)

class ToolSpec(BaseModel):
    """Specification of an enterprise agent tool."""
    name: str
    description: str
    input_model: Type[BaseModel]
    func: Callable[..., Any]
    side_effect: bool = False
    allowed_roles: List[str] = ["*"]
    approval_rule: Optional[str] = None
    timeout_s: float = 10.0

    model_config = ConfigDict(arbitrary_types_allowed=True)

    def to_openai_schema(self) -> Dict[str, Any]:
        """Converts tool specification to OpenAI function calling format."""
        schema = self.input_model.model_json_schema()
        # Clean up internal pydantic metadata
        schema.pop("title", None)
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": schema,
            }
        }

def tool(
    name: str,
    description: str,
    input_model: Type[BaseModel],
    side_effect: bool = False,
    allowed_roles: Optional[List[str]] = None,
    approval_rule: Optional[str] = None,
    timeout_s: float = 10.0,
) -> Callable[[Callable[..., Any]], ToolSpec]:
    """Decorator to declare an enterprise platform tool."""
    def decorator(fn: Callable[..., Any]) -> ToolSpec:
        spec = ToolSpec(
            name=name,
            description=description,
            input_model=input_model,
            func=fn,
            side_effect=side_effect,
            allowed_roles=allowed_roles or ["*"],
            approval_rule=approval_rule,
            timeout_s=timeout_s,
        )
        return spec
    return decorator
