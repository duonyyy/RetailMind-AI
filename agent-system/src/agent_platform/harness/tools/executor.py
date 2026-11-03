import asyncio
import inspect
import json
import os
import re
import urllib.parse
import uuid
from typing import Dict, Any, Optional, Set
from pydantic import ValidationError
from agent_platform.harness.state.principal import Principal
from agent_platform.harness.tools.registry import ToolRegistry
from agent_platform.harness.tools.spec import ToolContext, ToolUnavailableError, ConfirmedOrderStatus, ConfirmedCatalogRead, ConfirmedCartRead, ConfirmedInventoryRead
from agent_platform.harness.tools.commerce_contracts import ConfirmedCommerceWrite
from agent_platform.harness.tools.idempotency import IdempotencyManager
from agent_platform.harness.persistence.ports import PersistenceError
from agent_platform.harness.governance.policy import PolicyEngine
from agent_platform.harness.governance.audit_ledger import TamperEvidentHashChainLedger
from agent_platform.harness.guards.pii import PIIMasker

DEFAULT_ALLOWED_EGRESS_HOSTS: Set[str] = {
    "localhost",
    "127.0.0.1",
    "::1",
    "[::1]",
    "0.0.0.0",
    "core-api",
    "retailmind.internal",
    "cdn.tgdd.vn",
    "mwg.vn",
    "thegioididong.com",
    "dienmayxanh.com",
}

_URL_PATTERN = re.compile(r"https?://[^\s'\"<>]+", re.IGNORECASE)


def is_egress_host_allowed(destination: str, allowed_hosts: Set[str]) -> bool:
    """Validates if a destination hostname or URL is permitted by the egress allowlist."""
    if not destination:
        return True
    target = destination.strip()
    if target.startswith(("http://", "https://")):
        try:
            parsed = urllib.parse.urlparse(target)
            host = parsed.hostname or ""
        except Exception:
            return False
    else:
        host = target.split(":")[0].strip()

    host_lower = host.lower()
    if not host_lower:
        return False

    for allowed in allowed_hosts:
        allowed_lower = allowed.lower()
        if host_lower == allowed_lower:
            return True
        if allowed_lower.startswith("*.") and host_lower.endswith(allowed_lower[1:]):
            return True
        if host_lower.endswith("." + allowed_lower):
            return True

    return False


def scan_arguments_for_untrusted_egress(value: Any, allowed_hosts: Set[str]) -> Optional[str]:
    """Recursively scans tool arguments for URLs or hostnames not on the egress allowlist.
    Returns the untrusted destination string if a violation is detected, otherwise None.
    """
    if isinstance(value, str):
        urls = _URL_PATTERN.findall(value)
        for url in urls:
            if not is_egress_host_allowed(url, allowed_hosts):
                return url
        if any(marker in value.lower() for marker in ("webhook.site", "burpcollaborator", "attacker.com", "requestbin", "pastebin.com")):
            return value
    elif isinstance(value, dict):
        for k, v in value.items():
            if k.lower() in ("url", "webhook_url", "callback_url", "target_url", "endpoint", "dest", "destination"):
                if isinstance(v, str) and not is_egress_host_allowed(v, allowed_hosts):
                    return v
            res = scan_arguments_for_untrusted_egress(v, allowed_hosts)
            if res:
                return res
    elif isinstance(value, (list, tuple)):
        for item in value:
            res = scan_arguments_for_untrusted_egress(item, allowed_hosts)
            if res:
                return res
    return None

class ToolExecutionResult:
    def __init__(
        self,
        output: Any = None,
        is_error: bool = False,
        error_code: Optional[str] = None,
        requires_approval: bool = False,
        approval_metadata: Optional[Dict[str, Any]] = None,
        commerce_answer: Optional[str] = None,
    ) -> None:
        self.output = output
        self.is_error = is_error
        self.error_code = error_code
        self.requires_approval = requires_approval
        self.approval_metadata = approval_metadata or {}
        self.commerce_answer = commerce_answer

    def to_dict(self) -> Dict[str, Any]:
        return {
            "output": self.output,
            "is_error": self.is_error,
            "error_code": self.error_code,
            "requires_approval": self.requires_approval,
            "approval_metadata": self.approval_metadata,
        }


def _contains_redaction_placeholder(value: Any) -> bool:
    """A redacted model argument cannot be used as authoritative business data."""
    placeholders = ("[REDACTED_PHONE]", "[REDACTED_CCCD]", "[REDACTED_EMAIL]",
                    "[REDACTED_SECRET]", "[REDACTED_TOKEN]", "[REDACTED_API_KEY]")
    if isinstance(value, str):
        return any(marker in value for marker in placeholders)
    if isinstance(value, dict):
        return any(_contains_redaction_placeholder(v) for v in value.values())
    if isinstance(value, (list, tuple)):
        return any(_contains_redaction_placeholder(v) for v in value)
    return False

class ToolExecutor:
    """
    Executes tools through strict 9-step governance and security pipeline:
    1. Registry scope check
    2. Pydantic typed validation (with sanitized error output)
    3. Server-side RBAC authorization
    4. Policy rules evaluation (Decimal-safe)
    5. HITL interrupt gating
    6. Idempotency replay check (sha256(thread_id + call_id))
    7. Timed async execution with timeout
    8. Tamper-evident hash chain audit logging (with truly masked inputs)
    9. Output sanitization & delimiter wrapping (with PII redaction)
    """

    def __init__(
        self,
        registry: ToolRegistry,
        policy_engine: PolicyEngine,
        audit_ledger: Optional[TamperEvidentHashChainLedger] = None,
        idempotency_manager: Optional[IdempotencyManager] = None,
        http_client: Any = None,
        allowed_egress_hosts: Optional[Set[str]] = None,
    ) -> None:
        self.registry = registry
        self.policy_engine = policy_engine
        self.audit_ledger = audit_ledger or TamperEvidentHashChainLedger()
        self.idempotency = idempotency_manager or IdempotencyManager()
        self.http_client = http_client
        self.allowed_egress_hosts = set(DEFAULT_ALLOWED_EGRESS_HOSTS)
        if allowed_egress_hosts:
            self.allowed_egress_hosts.update(allowed_egress_hosts)
        env_allowlist = os.getenv("RETAILMIND_EGRESS_ALLOWLIST")
        if env_allowlist:
            self.allowed_egress_hosts.update(h.strip() for h in env_allowlist.split(",") if h.strip())

    async def execute(
        self,
        tool_name: str,
        arguments: Dict[str, Any],
        principal: Principal,
        thread_id: str = "default_thread",
        call_id: str = "default_call",
        run_id: str = "default_run",
        operation_id: Optional[str] = None,
    ) -> ToolExecutionResult:
        # Step 1: Tra registry
        tool_spec = self.registry.get(tool_name)
        if not tool_spec:
            return ToolExecutionResult(
                output=f"Error: Tool '{tool_name}' not found or not enabled in domain pack.",
                is_error=True,
                error_code="tool_not_found",
            )

        # An LLM sees placeholders only. Never execute them as real data.
        if _contains_redaction_placeholder(arguments):
            return ToolExecutionResult(
                output="Không thể sử dụng thông tin đã che để thực hiện yêu cầu. Vui lòng cung cấp thông tin qua kênh nhập liệu an toàn khi có hỗ trợ.",
                is_error=True,
                error_code="sensitive_input_unavailable",
            )

        # Step 2: Pydantic typed validation
        try:
            validated_args = tool_spec.input_model(**arguments)
        except ValidationError as ve:
            masked_errors = []
            for err in ve.errors():
                loc = err.get("loc", ())
                field = next((part for part in reversed(loc) if isinstance(part, str)), "input")
                masked_input = PIIMasker.mask({field: err.get("input")}, fail_closed=False)
                masked_errors.append({"type": err.get("type"), "loc": PIIMasker.mask(loc, fail_closed=False),
                                      "input": next(iter(masked_input.values()))})
            return ToolExecutionResult(
                output=f"Input validation error for tool '{tool_name}': {masked_errors}",
                is_error=True,
                error_code="validation_error",
            )

        # Step 2.5: Egress Network Allowlist Check (VinAI Lethal Trifecta & Exfiltration Defense)
        untrusted_destination = scan_arguments_for_untrusted_egress(arguments, self.allowed_egress_hosts)
        if untrusted_destination:
            self.audit_ledger.record_event(
                event_id=f"audit_{call_id}",
                thread_id=thread_id,
                user_id=principal.user_id,
                role=principal.role,
                tenant_id=principal.tenant_id,
                tool_name=tool_name,
                input_masked={"destination": PIIMasker.mask_text(str(untrusted_destination))},
                decision="egress_blocked",
            )
            return ToolExecutionResult(
                output=f"Security error: Egress network access to untrusted destination '{PIIMasker.mask_text(str(untrusted_destination))}' is blocked by egress firewall allowlist.",
                is_error=True,
                error_code="egress_blocked",
            )

        # Step 3: RBAC Authorization
        is_role_allowed = (
            "*" in tool_spec.allowed_roles or
            principal.role in tool_spec.allowed_roles or
            self.policy_engine.check_rbac(principal.role, tool_name)
        )
        if not is_role_allowed:
            self.audit_ledger.record_event(
                event_id=f"audit_{call_id}",
                thread_id=thread_id,
                user_id=principal.user_id,
                role=principal.role,
                tenant_id=principal.tenant_id,
                tool_name=tool_name,
                input_masked={"arguments_keys": PIIMasker.mask(list(arguments.keys()), fail_closed=False)},
                decision="forbidden",
            )
            return ToolExecutionResult(
                output=f"Security error: Role '{principal.role}' is not authorized to execute '{tool_name}'.",
                is_error=True,
                error_code="forbidden",
            )

        # Step 4: Policy rule evaluation
        args_dict = validated_args.model_dump()
        if tool_spec.approval_rule:
            decision = self.policy_engine.evaluate_approval_rule(tool_spec.approval_rule, args_dict)
            if decision.action == "deny":
                return ToolExecutionResult(
                    output=f"Policy error: Action denied by governance policy: {decision.reason}",
                    is_error=True,
                    error_code="policy_denied",
                )

            # Step 5: HITL Gate
            if decision.action == "require_approval":
                return ToolExecutionResult(
                    output=f"Tool '{tool_name}' requires human approval before execution.",
                    requires_approval=True,
                    approval_metadata={
                        "rule": tool_spec.approval_rule,
                        "approver_role": decision.approver_role,
                        "timeout_hours": decision.timeout_hours,
                        "arguments": PIIMasker.mask(args_dict, fail_closed=False),
                    },
                )

        # Step 6: Idempotency Key Gate (Atomic reservation & payload check for side-effect tools)
        idem_key = self.idempotency.generate_key(thread_id, call_id)
        backend_idempotency_key = str(uuid.uuid4()) if tool_spec.side_effect else idem_key
        if tool_spec.side_effect and operation_id is not None:
            try:
                parsed = uuid.UUID(operation_id)
                if parsed.version != 4 or str(parsed) != operation_id.lower():
                    raise ValueError("invalid operation id")
            except (ValueError, AttributeError, TypeError):
                return ToolExecutionResult(output="Mã thao tác không hợp lệ.", is_error=True, error_code="validation_error")
            backend_idempotency_key = str(parsed)
            identity = json.dumps([principal.tenant_id, principal.user_id], ensure_ascii=False, separators=(",", ":"))
            idem_key = self.idempotency.generate_key(identity, backend_idempotency_key)
        if tool_spec.side_effect:
            if hasattr(self.idempotency, "begin_execution"):
                reservation = self.idempotency.begin_execution(
                    idem_key,
                    tenant_id=principal.tenant_id,
                    user_id=principal.user_id,
                    thread_id=thread_id,
                    tool_name=tool_name,
                    call_id=call_id,
                    arguments=args_dict,
                    backend_idempotency_key=backend_idempotency_key,
                )
                if reservation.action == "replay":
                    # Masked fingerprints can collide for different private values.
                    # Do not claim a replay matches if any argument was redacted.
                    if operation_id is not None and PIIMasker.mask(args_dict, fail_closed=False) != args_dict:
                        return ToolExecutionResult(output="Cần đối soát thao tác đã gửi trước khi tiếp tục.",
                                                   is_error=True, error_code="unknown_outcome")
                    cached = reservation.output
                    if isinstance(cached, str) and cached.startswith("commerce-result-v1:"):
                        try:
                            envelope = json.loads(cached[len("commerce-result-v1:"):])
                            return ToolExecutionResult(output=envelope["output"], is_error=False,
                                                       commerce_answer=envelope["answer"])
                        except (ValueError, KeyError, TypeError):
                            return ToolExecutionResult(output="Không thể xác nhận kết quả đã lưu; cần đối soát.",
                                                       is_error=True, error_code="unknown_outcome")
                    return ToolExecutionResult(output=cached, is_error=False)
                if reservation.action in ("conflict", "in_progress", "unknown_outcome"):
                    return ToolExecutionResult(
                        output=reservation.message or "Idempotency check rejected execution.",
                        is_error=True,
                        error_code=reservation.error_code or "idempotency_conflict",
                    )
            elif self.idempotency.has(idem_key):
                cached_output = self.idempotency.get(idem_key)
                return ToolExecutionResult(output=cached_output, is_error=False)

        # Step 7: Timed Execution (Backend receives trusted, unmasked business data)
        ctx = ToolContext(
            principal=principal,
            idempotency_key=backend_idempotency_key,
            thread_id=thread_id,
            run_id=run_id,
            http_client=self.http_client,
        )

        try:
            fn = tool_spec.func
            if inspect.iscoroutinefunction(fn):
                exec_coro = fn(validated_args, ctx)
            else:
                exec_coro = asyncio.to_thread(fn, validated_args, ctx)

            raw_output = await asyncio.wait_for(exec_coro, timeout=tool_spec.timeout_s)
        except ToolUnavailableError as exc:
            ambiguous = tool_spec.side_effect and getattr(ctx, "outcome_ambiguous", False)
            if tool_spec.side_effect:
                if ambiguous and hasattr(
                    self.idempotency, "mark_unknown_outcome"
                ):
                    self.idempotency.mark_unknown_outcome(idem_key, error_code="unavailable")
                elif hasattr(self.idempotency, "abort_execution"):
                    self.idempotency.abort_execution(idem_key)
            return ToolExecutionResult(
                output=PIIMasker.mask(str(exc), fail_closed=False),
                is_error=True,
                error_code="unknown_outcome" if ambiguous else "unavailable",
            )
        except asyncio.TimeoutError:
            if tool_spec.side_effect and hasattr(self.idempotency, "mark_unknown_outcome"):
                self.idempotency.mark_unknown_outcome(idem_key, error_code="timeout")
            return ToolExecutionResult(
                output=(
                    "Không thể xác nhận kết quả thao tác; hãy kiểm tra trạng thái trước khi thử lại."
                    if tool_spec.side_effect
                    else f"Execution error: Tool '{tool_name}' timed out after {tool_spec.timeout_s}s."
                ),
                is_error=True,
                error_code="unknown_outcome" if tool_spec.side_effect else "timeout",
            )
        except PersistenceError:
            raise
        except Exception as exc:
            if tool_spec.side_effect:
                if getattr(ctx, "outcome_ambiguous", False) and hasattr(self.idempotency, "mark_unknown_outcome"):
                    self.idempotency.mark_unknown_outcome(idem_key, error_code="execution_failure")
                elif hasattr(self.idempotency, "abort_execution"):
                    self.idempotency.abort_execution(idem_key)
            ambiguous = tool_spec.side_effect and getattr(ctx, "outcome_ambiguous", False)
            return ToolExecutionResult(
                output=("Không thể xác nhận kết quả thao tác; hãy kiểm tra trạng thái trước khi thử lại."
                        if ambiguous else f"Execution error in tool '{tool_name}': {PIIMasker.mask(str(exc), fail_closed=False)}"),
                is_error=True,
                error_code="unknown_outcome" if ambiguous else "execution_failure",
            )

        # Step 8: Output Sanitization & Escaping (Outputs are verified masked before reaching LLM / State)
        masked_output = PIIMasker.mask(raw_output, fail_closed=False)
        sanitized_str = (
            json.dumps(masked_output, default=str, ensure_ascii=False)
            if isinstance(masked_output, (dict, list))
            else PIIMasker.mask_text(str(masked_output))
        )
        if len(sanitized_str) > 4000:
            sanitized_str = sanitized_str[:4000] + "... [truncated]"

        wrapped_output = f"<tool_output name=\"{tool_name}\">\n{sanitized_str}\n</tool_output>"

        write_answer = (PIIMasker.mask(raw_output["answer"], fail_closed=True)
                        if tool_spec.side_effect and isinstance(raw_output, ConfirmedCommerceWrite) else None)
        cached_output = ("commerce-result-v1:" + json.dumps({"output": wrapped_output, "answer": write_answer}, ensure_ascii=False)
                         if write_answer else wrapped_output)
        if tool_spec.side_effect:
            if hasattr(self.idempotency, "complete_execution"):
                self.idempotency.complete_execution(idem_key, cached_output)
            else:
                self.idempotency.record(idem_key, cached_output)

        # Step 9: Tamper-Evident Audit Logging (Inputs are verified masked)
        self.audit_ledger.record_event(
            event_id=f"audit_{call_id}",
            thread_id=thread_id,
            user_id=principal.user_id,
            role=principal.role,
            tenant_id=principal.tenant_id,
            tool_name=tool_name,
            input_masked=PIIMasker.mask(args_dict, fail_closed=False),
            decision="executed",
        )

        commerce_answer = write_answer
        if (not tool_spec.side_effect and tool_name in ("query_order_status", "lookup_order")
                and isinstance(raw_output, ConfirmedOrderStatus)):
            order_id = raw_output.get("order_id")
            order_status = raw_output.get("order_status")
            if (isinstance(order_id, str) and order_id == args_dict.get("order_id")
                    and isinstance(order_status, str) and order_status in
                    {"PENDING", "CONFIRMED", "PLACED", "CANCELLED", "COMPLETED"}):
                commerce_answer = PIIMasker.mask(
                    f"Đơn hàng {order_id} có trạng thái {order_status}.", fail_closed=True
                )
        elif not tool_spec.side_effect and tool_name == "check_inventory" and isinstance(raw_output, ConfirmedInventoryRead):
            sku = " ".join(raw_output["sku"].split())[:100]
            store = " ".join(raw_output["store_code"].split())[:100]
            commerce_answer = PIIMasker.mask(
                f"Core xác nhận sản phẩm {sku} còn {raw_output['available_qty']} tại cửa hàng {store}.", fail_closed=True)
        elif not tool_spec.side_effect and isinstance(raw_output, ConfirmedCatalogRead):
            if "total_matched" in raw_output and "items" in raw_output:
                products, count, price_field = raw_output["items"], raw_output["total_matched"], "price_vnd"
            elif "product" in raw_output:
                products, count, price_field = [raw_output["product"]], 1, "priceVnd"
            elif "comparison" in raw_output:
                products, count, price_field = raw_output["comparison"], raw_output.get("total", len(raw_output["comparison"])), "priceVnd"
            else:
                products, count, price_field = [], 0, ""
            if price_field:
                low_price = raw_output.get("prefer_low_price") is True
                limit = 3 if low_price else 10
                money = lambda value: f"{int(value):,}".replace(",", ".")
                if not count:
                    lines = ["Hiện chưa tìm thấy sản phẩm phù hợp với bộ lọc này."]
                    if raw_output.get("max_price_vnd") is not None:
                        lines.append(f"Mức giá đang lọc: không quá {money(raw_output['max_price_vnd'])} VNĐ.")
                    lines.append("Bạn muốn tìm trong khoảng ngân sách nào, hoặc có thể thay đổi yêu cầu cấu hình không?")
                elif low_price:
                    lines = ["Mình gợi ý các mẫu có giá thấp nhất trong kết quả tìm kiếm hiện tại:"]
                else:
                    lines = [f"Mình tìm được {count} sản phẩm phù hợp:"]
                for product in products[:limit]:
                    name = " ".join(product["name"].split())[:200]
                    sku = " ".join(product["sku"].split())[:100]
                    lines.append(f"{sku}: {name} — {money(product[price_field])} VNĐ.")
                if count > limit:
                    lines.append(f"Đang gợi ý {limit} trong {count} sản phẩm phù hợp.")
                if low_price and count:
                    lines.append(raw_output.get("follow_up_question") or "Bạn dự định chi khoảng bao nhiêu và có yêu cầu gì thêm?")
                commerce_answer = PIIMasker.mask("\n".join(lines), fail_closed=True)
        elif not tool_spec.side_effect and tool_name == "view_cart" and isinstance(raw_output, ConfirmedCartRead):
            items = raw_output["items"]
            lines = [f"Giỏ hàng có {raw_output['total_items']} sản phẩm."]
            for item in items[:10]:
                sku = " ".join(item["sku"].split())[:100]
                name = " ".join(item["name"].split())[:200]
                lines.append(f"{sku}: {name} — {item['quantity']} x {item['unit_price_vnd']} VNĐ = {item['line_total_vnd']} VNĐ.")
            if len(items) > 10:
                lines.append(f"Hiển thị 10 trong {len(items)} dòng sản phẩm.")
            lines.append(f"Tạm tính: {raw_output['subtotal_vnd']} VNĐ; VAT: {raw_output['vat_vnd']} VNĐ; tổng: {raw_output['total_vnd']} VNĐ.")
            commerce_answer = PIIMasker.mask("\n".join(lines), fail_closed=True)
        return ToolExecutionResult(output=wrapped_output, is_error=False, commerce_answer=commerce_answer)
