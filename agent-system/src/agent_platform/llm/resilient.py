import asyncio
import logging
from typing import List, Dict, Any, Optional, AsyncIterator
from agent_platform.llm.base import LLMPort, LLMResponse, LLMChunk, LLMUnavailableError

logger = logging.getLogger("agent_platform.llm.resilient")

def _mask_pii(data: Any, fail_closed: bool = True) -> Any:
    """Lazy import to eliminate circular import cycle between llm and harness packages."""
    from agent_platform.harness.guards.pii import PIIMasker
    return PIIMasker.mask(data, fail_closed=fail_closed)

class CircuitState:
    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HALF_OPEN = "HALF_OPEN"

class ResilientLLMClient(LLMPort):
    """
    Resilient wrapper around primary and fallback LLMPort clients.
    Features:
    - Circuit Breaker to isolate upstream outage.
    - Automatic fallback downgrade ladder.
    - Exponential backoff with jitter on transient failures.
    - Verified PII redaction before provider egress.
    """

    def __init__(
        self,
        primary_client: LLMPort,
        fallback_client: Optional[LLMPort] = None,
        max_retries: int = 2,
        failure_threshold: int = 3,
        recovery_time_seconds: float = 30.0,
    ) -> None:
        self.primary = primary_client
        self.fallback = fallback_client
        self.max_retries = max_retries
        self.failure_threshold = failure_threshold
        self.recovery_time_seconds = recovery_time_seconds

        self._consecutive_failures = 0
        self._circuit_state = CircuitState.CLOSED
        self._last_failure_time = 0.0

    def _should_use_fallback(self) -> bool:
        loop = asyncio.get_event_loop()
        now = loop.time()
        if self._circuit_state == CircuitState.OPEN:
            if now - self._last_failure_time > self.recovery_time_seconds:
                self._circuit_state = CircuitState.HALF_OPEN
                logger.info("LLM Circuit half-open: attempting test request on primary")
                return False
            return True
        return False

    def _record_success(self) -> None:
        self._consecutive_failures = 0
        self._circuit_state = CircuitState.CLOSED

    def _record_failure(self) -> None:
        self._consecutive_failures += 1
        loop = asyncio.get_event_loop()
        self._last_failure_time = loop.time()
        if self._consecutive_failures >= self.failure_threshold:
            self._circuit_state = CircuitState.OPEN
            logger.warning("LLM Circuit OPEN: Tripping to fallback provider")

    async def complete(
        self,
        messages: List[Dict[str, Any]],
        *,
        tools: Optional[List[Dict[str, Any]]] = None,
        temperature: float = 0.0,
        max_tokens: int = 2048,
    ) -> LLMResponse:
        # Redact messages fail-closed before dispatching to primary/fallback
        safe_messages = _mask_pii(messages, fail_closed=True)

        if self._should_use_fallback() and self.fallback:
            logger.warning("Primary circuit open; directing completion to fallback client")
            return await self.fallback.complete(
                safe_messages, tools=tools, temperature=temperature, max_tokens=max_tokens
            )

        # Retry loop on primary
        for attempt in range(self.max_retries + 1):
            try:
                resp = await self.primary.complete(
                    safe_messages, tools=tools, temperature=temperature, max_tokens=max_tokens
                )
                self._record_success()
                return resp
            except Exception as e:
                safe_err = _mask_pii(str(e), fail_closed=False)
                logger.warning("Primary LLM complete attempt %d failed: %s", attempt + 1, safe_err)
                if attempt == self.max_retries:
                    self._record_failure()
                    if self.fallback:
                        logger.error("Primary LLM exhausted retries; falling back")
                        return await self.fallback.complete(
                            safe_messages, tools=tools, temperature=temperature, max_tokens=max_tokens
                        )
                    raise LLMUnavailableError("Configured model is unavailable") from None
                await asyncio.sleep(0.5 * (2 ** attempt))

        raise RuntimeError("Unexpected resilient completion exit")

    async def stream(
        self,
        messages: List[Dict[str, Any]],
        *,
        tools: Optional[List[Dict[str, Any]]] = None,
        temperature: float = 0.0,
    ) -> AsyncIterator[LLMChunk]:
        safe_messages = _mask_pii(messages, fail_closed=True)

        if self._should_use_fallback() and self.fallback:
            async for chunk in self.fallback.stream(safe_messages, tools=tools, temperature=temperature):
                yield chunk
            return

        try:
            async for chunk in self.primary.stream(safe_messages, tools=tools, temperature=temperature):
                yield chunk
            self._record_success()
        except Exception as e:
            self._record_failure()
            safe_err = _mask_pii(str(e), fail_closed=False)
            logger.error("Primary stream failed: %s", safe_err)
            if self.fallback:
                logger.info("Redirecting stream to fallback client")
                async for chunk in self.fallback.stream(safe_messages, tools=tools, temperature=temperature):
                    yield chunk
            else:
                raise LLMUnavailableError("Configured model is unavailable") from None
