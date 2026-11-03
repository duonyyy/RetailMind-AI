import json
import re
import uuid
from typing import List, Dict, Any, Optional, AsyncIterator
import httpx
from agent_platform.llm.base import LLMPort, LLMResponse, LLMChunk, ToolCall, Usage

def _mask_pii(data: Any, fail_closed: bool = True) -> Any:
    from agent_platform.harness.guards.pii import PIIMasker
    return PIIMasker.mask(data, fail_closed=fail_closed)

class GeminiLLM(LLMPort):
    """
    Google Gemini Native REST Client supporting Function Calling and True SSE Streaming (Fixes A15).
    Communicates directly with Google AI Studio API without external bulky dependencies.
    """

    def __init__(
        self,
        api_key: str = "",
        model_name: str = "gemini-1.5-flash",
        timeout_seconds: float = 30.0,
        http_client: Optional[httpx.AsyncClient] = None,
    ) -> None:
        self.api_key = api_key
        self.model_name = model_name
        self.timeout_seconds = timeout_seconds
        self._external_client = http_client
        self.base_url = "https://generativelanguage.googleapis.com/v1beta"

    def _convert_messages(self, messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Converts standard chat messages to Gemini contents format."""
        contents: List[Dict[str, Any]] = []
        for m in messages:
            role = m.get("role", "user")
            if role == "system":
                continue
            content = m.get("content", "")
            gemini_role = "model" if role in ("assistant", "model") else "user"

            parts: List[Dict[str, Any]] = []
            if content and role != "tool":
                parts.append({"text": str(content)})

            if role in ("assistant", "model"):
                for call in m.get("tool_calls", []):
                    function = call.get("function", {})
                    arguments = function.get("arguments", {})
                    if isinstance(arguments, str):
                        arguments = json.loads(arguments)
                    parts.append({"functionCall": {"name": function.get("name", ""), "args": arguments}})

            # Check if previous tool response
            if role == "tool":
                parts.append({
                    "functionResponse": {
                        "name": m.get("name", "tool_result"),
                        "response": {"output": content},
                    }
                })

            if parts:
                contents.append({"role": gemini_role, "parts": parts})
        return contents

    def _system_instruction(self, messages: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        texts = [str(m["content"]) for m in messages if m.get("role") == "system" and m.get("content")]
        return {"parts": [{"text": "\n\n".join(texts)}]} if texts else None

    def _convert_tools(self, tools: Optional[List[Dict[str, Any]]]) -> Optional[List[Dict[str, Any]]]:
        """Converts standard tool specs to Gemini functionDeclarations format."""
        if not tools:
            return None
        declarations: List[Dict[str, Any]] = []
        for t in tools:
            spec = t.get("function", t)
            declarations.append({
                "name": spec.get("name", ""),
                "description": spec.get("description", ""),
                # Pydantic emits JSON Schema (including exclusiveMinimum and
                # additionalProperties), not Gemini's smaller OpenAPI Schema.
                "parametersJsonSchema": spec.get("parameters", {}),
            })
        return [{"functionDeclarations": declarations}]

    async def complete(
        self,
        messages: List[Dict[str, Any]],
        *,
        tools: Optional[List[Dict[str, Any]]] = None,
        temperature: float = 0.0,
        max_tokens: int = 2048,
    ) -> LLMResponse:
        # Fail-closed PII redaction before provider egress
        redacted_messages = _mask_pii(messages, fail_closed=True)
        url = f"{self.base_url}/models/{self.model_name}:generateContent?key={self.api_key}"
        payload: Dict[str, Any] = {
            "contents": self._convert_messages(redacted_messages),
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
            }
        }
        if instruction := self._system_instruction(redacted_messages):
            payload["systemInstruction"] = instruction
        if gemini_tools := self._convert_tools(tools):
            payload["tools"] = gemini_tools

        client = self._external_client or httpx.AsyncClient(timeout=self.timeout_seconds)
        try:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPStatusError as exc:
            safe_text = _mask_pii(exc.response.text[:300], fail_closed=False) if exc.response is not None else ""
            raise RuntimeError(f"Gemini completion failed [{exc.response.status_code}]: {safe_text}") from None
        except Exception as exc:
            if isinstance(exc, RuntimeError) and "Gemini completion failed" in str(exc):
                raise
            safe_msg = _mask_pii(str(exc), fail_closed=False)
            safe_msg = re.sub(r"key=[A-Za-z0-9_-]+", "key=[REDACTED_API_KEY]", safe_msg)
            raise RuntimeError(f"Gemini completion request error: {safe_msg}") from None
        finally:
            if not self._external_client:
                await client.aclose()

        candidates = data.get("candidates", [])
        content_text: Optional[str] = None
        tool_calls: List[ToolCall] = []

        if candidates:
            parts = candidates[0].get("content", {}).get("parts", [])
            for p in parts:
                if "text" in p:
                    content_text = (content_text or "") + p["text"]
                elif "functionCall" in p:
                    fc = p["functionCall"]
                    tool_calls.append(ToolCall(
                        id=f"gemini_call_{uuid.uuid4().hex}",
                        name=fc.get("name", ""),
                        arguments=fc.get("args", {}),
                    ))

        usage_meta = data.get("usageMetadata", {})
        usage = Usage(
            prompt_tokens=usage_meta.get("promptTokenCount", 0),
            completion_tokens=usage_meta.get("candidatesTokenCount", 0),
            total_tokens=usage_meta.get("totalTokenCount", 0),
        )

        return LLMResponse(
            content=content_text,
            tool_calls=tool_calls,
            usage=usage,
            model=self.model_name,
            provider="gemini",
        )

    async def stream(
        self,
        messages: List[Dict[str, Any]],
        *,
        tools: Optional[List[Dict[str, Any]]] = None,
        temperature: float = 0.0,
    ) -> AsyncIterator[LLMChunk]:
        """True SSE streaming using Gemini streamGenerateContent endpoint."""
        # Fail-closed PII redaction before provider egress
        redacted_messages = _mask_pii(messages, fail_closed=True)
        url = f"{self.base_url}/models/{self.model_name}:streamGenerateContent?alt=sse&key={self.api_key}"
        payload: Dict[str, Any] = {
            "contents": self._convert_messages(redacted_messages),
            "generationConfig": {"temperature": temperature},
        }
        if instruction := self._system_instruction(redacted_messages):
            payload["systemInstruction"] = instruction
        if gemini_tools := self._convert_tools(tools):
            payload["tools"] = gemini_tools

        client = self._external_client or httpx.AsyncClient(timeout=self.timeout_seconds)
        try:
            async with client.stream("POST", url, json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line or not line.startswith("data: "):
                        continue
                    data_str = line[6:].strip()
                    try:
                        chunk_json = json.loads(data_str)
                        candidates = chunk_json.get("candidates", [])
                        if candidates:
                            parts = candidates[0].get("content", {}).get("parts", [])
                            for p in parts:
                                if "text" in p and p["text"]:
                                    yield LLMChunk(delta_content=p["text"])
                                elif "functionCall" in p:
                                    fc = p["functionCall"]
                                    yield LLMChunk(tool_call_delta={
                                        "name": fc.get("name", ""),
                                        "args": fc.get("args", {}),
                                    })
                        if usage_meta := chunk_json.get("usageMetadata"):
                            yield LLMChunk(usage=Usage(
                                prompt_tokens=usage_meta.get("promptTokenCount", 0),
                                completion_tokens=usage_meta.get("candidatesTokenCount", 0),
                                total_tokens=usage_meta.get("totalTokenCount", 0),
                            ))
                    except Exception:
                        continue
        finally:
            if not self._external_client:
                await client.aclose()
