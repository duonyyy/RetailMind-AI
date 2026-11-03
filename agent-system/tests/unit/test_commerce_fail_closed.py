import asyncio
from pathlib import Path

import httpx
import pytest

from agent_platform.harness.governance.policy import PolicyEngine
from agent_platform.harness.state.principal import Principal
from agent_platform.harness.tools.executor import ToolExecutor
from agent_platform.harness.tools.registry import ToolRegistry
from agent_platform.agents.workflow.nodes.tool_exec import create_tool_exec_node

CASES = [
    ("check_inventory", {"sku": "ABC"}),
    ("view_cart", {}),
    ("add_to_cart", {"sku": "ABC"}),
    ("remove_from_cart", {"sku": "ABC"}),
    ("preview_order", {"sku": "ABC"}),
    ("query_order_status", {"order_id": "ORD-100201"}),
    ("cancel_simulated_order", {"order_id": "ORD-100201", "reason": "khong can"}),
    ("create_support_ticket", {"title": "ho tro", "description": "can ho tro"}),
]


@pytest.fixture(scope="module")
def registry():
    result = ToolRegistry()
    result.load_from_module_file(Path("domains/retail_store/tools.py"))
    return result


@pytest.mark.parametrize("name,args", CASES)
@pytest.mark.parametrize("failure", ["timeout", "403", "404", "500", "empty", "invalid_json", "error_body"])
def test_unconfirmed_backend_never_returns_success(registry, monkeypatch, name, args, failure):
    spec = registry.get(name)
    module_globals = spec.func.__globals__
    module_globals["_NESTJS_OFFLINE_UNTIL"] = 0
    class Client:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def post(self, url, json, headers):
            if failure == "timeout":
                raise httpx.ReadTimeout("timeout")
            if failure in ("403", "404", "500"):
                return httpx.Response(int(failure), json={})
            if failure == "invalid_json":
                return httpx.Response(200, text="invalid")
            return httpx.Response(200, json={} if failure == "empty" else {"data": {"status": "error"}})
    monkeypatch.setattr(httpx, "AsyncClient", Client)
    executor = ToolExecutor(registry, PolicyEngine.load_from_file("domains/retail_store/policies.yaml"))
    async def run():
        result = await executor.execute(name, args, Principal(user_id="alice", role="customer"), call_id="same")
        assert result.is_error and result.error_code == "unavailable"
        assert "success" not in result.output.lower()
        assert not executor.idempotency._store
    asyncio.run(run())


def test_refund_is_not_reported_processed(registry):
    executor = ToolExecutor(registry, PolicyEngine.load_from_file("domains/retail_store/policies.yaml"))
    async def run():
        result = await executor.execute("request_return_or_refund", {"order_id":"ORD-100201", "amount":"100000", "reason":"giao cham", "customer_name":"Alice"}, Principal(user_id="alice", role="customer"))
        assert result.is_error and result.error_code == "unavailable"
        assert "processed" not in result.output
    asyncio.run(run())


def test_failed_read_is_not_evidence_and_stops_workflow(registry, monkeypatch):
    spec = registry.get("check_inventory")
    async def unavailable(*args, **kwargs): return None
    monkeypatch.setitem(spec.func.__globals__, "_call_nestjs_tool", unavailable)
    executor = ToolExecutor(registry, PolicyEngine.load_from_file("domains/retail_store/policies.yaml"))
    async def run():
        node = create_tool_exec_node(executor)
        state = {"principal": Principal(user_id="alice", role="customer"), "pending_tool_calls": [{"name":"check_inventory", "arguments":{"sku":"ABC"}, "id":"c1"}]}
        result = await node(state)
        assert result["status"] == "abstained"
        assert result["evidence"] == []
        assert result["tool_events"][0].is_error
        assert "Không thể xác minh" in result["final_answer"]
    asyncio.run(run())


def test_zero_stock_is_valid_and_not_an_error(registry, monkeypatch):
    spec = registry.get("check_inventory")
    async def backend(*args, **kwargs): return {"sku": "ABC", "store_id": "store-1", "store_code": "MWG_HCM_001", "available_qty": 0}
    monkeypatch.setitem(spec.func.__globals__, "_call_nestjs_tool", backend)
    executor = ToolExecutor(registry, PolicyEngine.load_from_file("domains/retail_store/policies.yaml"))
    async def run():
        result = await executor.execute("check_inventory", {"sku":"ABC"}, Principal(user_id="alice", role="customer"))
        assert not result.is_error
        assert '"available_qty": 0' in result.output
    asyncio.run(run())


@pytest.mark.parametrize("name,args,payload", [
    ("view_cart", {}, {"customer_id": "alice", "total_items": 0, "subtotal_vnd": "0", "vat_vnd": "0", "total_vnd": "0", "items": []}),
    ("add_to_cart", {"sku": "ABC"}, {"status": "success", "cart": {"customer_id": "alice", "items": []}}),
    ("remove_from_cart", {"sku": "ABC"}, {"status": "success", "cart": {"customer_id": "alice", "items": []}}),
    ("preview_order", {"sku": "ABC"}, {"previewToken": "signed", "totalVnd": "0"}),
    ("query_order_status", {"order_id": "ORD-100201"}, {"order_id": "ORD-100201", "order_status": "PENDING"}),
    ("cancel_simulated_order", {"order_id": "ORD-100201", "reason": "khong can"}, {"status": "success", "order_id": "ORD-100201", "action": "CANCELLED"}),
    ("create_support_ticket", {"title": "ho tro", "description": "can ho tro"}, {"status": "success", "ticket_id": "TCK-1", "ticket": {"ticketCode": "TCK-1", "customerId": "alice"}}),
])
def test_confirmed_backend_result_is_forwarded(registry, monkeypatch, name, args, payload):
    async def backend(*args, **kwargs): return payload
    monkeypatch.setitem(registry.get(name).func.__globals__, "_call_nestjs_tool", backend)
    executor = ToolExecutor(registry, PolicyEngine.load_from_file("domains/retail_store/policies.yaml"))
    async def run():
        result = await executor.execute(name, args, Principal(user_id="alice", role="customer"))
        assert not result.is_error
        assert '"source": "nestjs_commerce_ssot"' in result.output
    asyncio.run(run())
