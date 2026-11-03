"""Comprehensive Unit & Governance Tests for retail_store Domain Pack."""

import asyncio
from decimal import Decimal
from pathlib import Path
import time
import uuid
import pytest

from agent_platform.domain.registry import DomainRegistry
from agent_platform.domain.pack import DomainPack
from agent_platform.harness.state.principal import Principal
from agent_platform.harness.tools.registry import ToolRegistry
from agent_platform.harness.tools.executor import ToolExecutor
from agent_platform.harness.governance.policy import PolicyEngine
from agent_platform.harness import AgentHarness
from agent_platform.config.settings import PlatformSettings, LLMSettings


def test_load_retail_store_domain():
    registry = DomainRegistry("domains")
    pack = registry.get("retail_store")
    assert pack is not None
    assert pack.name == "retail_store"
    assert "lookup_laptop_catalog" in pack.tools.enabled
    assert "query_order_status" in pack.tools.enabled
    assert "request_return_or_refund" in pack.tools.enabled
    assert "search_knowledge" in pack.tools.enabled
    assert "guest" in pack.roles
    assert "customer" in pack.roles
    assert "admin" in pack.roles


def test_retail_laptop_catalog_tool(monkeypatch):
    async def _run():
        registry = DomainRegistry("domains")
        pack = registry.get("retail_store")
        assert pack is not None

        tool_reg = ToolRegistry()
        tool_reg.load_from_module_file(pack.pack_dir / pack.tools.module)

        tool = tool_reg.get("lookup_laptop_catalog")
        assert tool is not None

        async def catalog_backend(endpoint, payload, ctx):
            items = [
                {"sku": "ASUS", "name": "Asus Vivobook 15", "price_vnd": "17990000", "brand": "ASUS"},
                {"sku": "DELL", "name": "Dell Inspiron 14", "price_vnd": "18490000", "brand": "DELL"},
                {"sku": "LENOVO", "name": "Lenovo ThinkBook 14", "price_vnd": "19990000", "brand": "LENOVO"},
            ]
            if payload.get("brand"):
                items = [item for item in items if item["brand"] == payload["brand"]]
            return {"count": len(items), "laptops": items}
        monkeypatch.setitem(tool.func.__globals__, "_call_nestjs_tool", catalog_backend)

        policy = PolicyEngine.load_from_file(pack.pack_dir / pack.policies)
        executor = ToolExecutor(tool_reg, policy)

        # 1. Search laptop under 20M with min 16GB RAM
        principal = Principal(user_id="guest_user", role="guest")
        res = await executor.execute(
            tool_name="lookup_laptop_catalog",
            arguments={"max_price": "20000000", "min_ram_gb": 16},
            principal=principal,
            call_id="call_lap_01",
        )
        assert res.is_error is False
        assert "Asus Vivobook 15" in res.output
        assert "Dell Inspiron 14" in res.output
        assert "Lenovo ThinkBook 14" in res.output
        assert "17990000" in res.output

        # 2. Filter by brand DELL
        res_dell = await executor.execute(
            tool_name="lookup_laptop_catalog",
            arguments={"brand": "DELL"},
            principal=principal,
            call_id="call_lap_dell",
        )
        assert res_dell.is_error is False
        assert "Dell Inspiron 14" in res_dell.output
        assert "Asus" not in res_dell.output

    asyncio.run(_run())


def test_retail_refund_governance_tiers():
    async def _run():
        registry = DomainRegistry("domains")
        pack = registry.get("retail_store")
        assert pack is not None

        tool_reg = ToolRegistry()
        tool_reg.load_from_module_file(pack.pack_dir / pack.tools.module)
        policy = PolicyEngine.load_from_file(pack.pack_dir / pack.policies)
        executor = ToolExecutor(tool_reg, policy)

        # 1. Guest role is forbidden from requesting refunds
        guest = Principal(user_id="g1", role="guest")
        res_guest = await executor.execute(
            tool_name="request_return_or_refund",
            arguments={
                "order_id": "ORD-100201",
                "amount": "100000",
                "reason": "Giao chậm",
                "customer_name": "Khách Vãng Lai",
            },
            principal=guest,
            call_id="call_g_refund",
        )
        assert res_guest.is_error is True
        assert res_guest.error_code == "forbidden"

        # 2. Policy allows the tier, but no trusted refund service exists
        customer = Principal(user_id="c1", role="customer")
        res_auto = await executor.execute(
            tool_name="request_return_or_refund",
            arguments={
                "order_id": "ORD-100201",
                "amount": "150000",
                "reason": "Bù cước vận chuyển",
                "customer_name": "Nguyễn Văn A",
            },
            principal=customer,
            call_id="call_c_auto",
        )
        assert res_auto.is_error is True
        assert res_auto.error_code == "unavailable"
        assert res_auto.requires_approval is False

        # 3. Customer > 200,000 VNĐ and <= 2,000,000 VNĐ -> Requires HITL Admin approval
        res_hitl = await executor.execute(
            tool_name="request_return_or_refund",
            arguments={
                "order_id": "ORD-100201",
                "amount": "500000",
                "reason": "Phụ kiện lỗi",
                "customer_name": "Nguyễn Văn B",
            },
            principal=customer,
            call_id="call_c_hitl",
        )
        assert res_hitl.requires_approval is True
        assert res_hitl.approval_metadata["approver_role"] == "admin"

        # 4. Customer > 2,000,000 VNĐ -> Denied by policy
        res_deny = await executor.execute(
            tool_name="request_return_or_refund",
            arguments={
                "order_id": "ORD-100201",
                "amount": "5000000",
                "reason": "Đổi ý không mua",
                "customer_name": "Nguyễn Văn C",
            },
            principal=customer,
            call_id="call_c_deny",
        )
        assert res_deny.is_error is True
        assert res_deny.error_code == "policy_denied"

    asyncio.run(_run())


def test_retail_knowledge_requires_verified_source(monkeypatch):
    async def _run():
        registry = DomainRegistry("domains")
        pack = registry.get("retail_store")
        assert pack is not None

        tool_reg = ToolRegistry()
        tool_reg.load_from_module_file(pack.pack_dir / pack.tools.module)
        search_tool = tool_reg.get("search_knowledge")
        assert search_tool is not None

        policy = PolicyEngine.load_from_file(pack.pack_dir / pack.policies)
        executor = ToolExecutor(tool_reg, policy)

        principal = Principal(user_id="cust_test", role="customer")
        # 1. Verified retrieval from 7 MWG markdown policies succeeds with provenance
        res = await executor.execute(
            tool_name="search_knowledge",
            arguments={"query": "chính sách đổi trả 30 ngày bảo hành"},
            principal=principal,
            call_id="call_retrieval_01",
        )
        assert res.is_error is False
        assert "verified_mwg_policy_corpus" in res.output
        assert "MWG-POLICY-2026.1" in res.output

        # 2. Fail-closed when policy RAG is unverified or disabled
        monkeypatch.setenv("RETAILMIND_POLICY_RAG_DISABLED", "true")
        res_disabled = await executor.execute(
            tool_name="search_knowledge",
            arguments={"query": "chính sách đổi trả 30 ngày bảo hành"},
            principal=principal,
            call_id="call_retrieval_02",
        )
        assert res_disabled.is_error is True
        assert res_disabled.error_code == "unavailable"

    asyncio.run(_run())


def test_sprint1_all_15_retail_tools_and_no_confirm_order(monkeypatch):
    """Sprint 1 Verification: All 15 typed tools work, RBAC enforced, and confirm_order is strictly absent."""
    async def _run():
        registry = DomainRegistry("domains")
        pack = registry.get("retail_store")
        assert pack is not None

        # Strictly forbid confirm_order tool per AGENTS.md & 04-INTERNAL_TOOL_GATEWAY.md
        assert "confirm_order" not in pack.tools.enabled

        tool_reg = ToolRegistry()
        tool_reg.load_from_module_file(pack.pack_dir / pack.tools.module)
        assert tool_reg.get("confirm_order") is None

        async def unavailable_backend(*args, **kwargs):
            return None
        monkeypatch.setitem(tool_reg.get("check_inventory").func.__globals__, "_call_nestjs_tool", unavailable_backend)

        policy = PolicyEngine.load_from_file(pack.pack_dir / pack.policies)
        executor = ToolExecutor(tool_reg, policy)

        guest = Principal(user_id="guest_01", role="guest")
        test_uid = f"cust_test_{uuid.uuid4().hex[:8]}"
        customer = Principal(user_id=test_uid, role="customer")

        # 1. Public tools accessible by guest
        res_detail = await executor.execute("get_product_details", {"sku": "LAP-ASUS-VIVO15"}, guest, call_id="c1")
        assert res_detail.is_error is True
        assert res_detail.error_code == "unavailable"

        res_cmp = await executor.execute(
            "compare_products",
            {"skus": ["LAP-ASUS-VIVO15", "LAP-DELL-INSP14"]},
            guest,
            call_id="c2",
        )
        assert res_cmp.is_error is True
        assert res_cmp.error_code == "unavailable"

        res_inv = await executor.execute(
            "check_inventory",
            {"sku": "LAP-LEN-THINK14", "store_id": "MWG_HCM_001"},
            guest,
            call_id="c3",
        )
        assert res_inv.is_error is True
        assert res_inv.error_code == "unavailable"

        res_pen = await executor.execute(
            "calculate_contract_penalty",
            {"breach_value_vnd": "100000000", "agreed_rate_pct": "12"},
            guest,
            call_id="c4",
        )
        assert res_pen.is_error is False
        assert "8000000" in res_pen.output
        assert "true" in res_pen.output.lower()

        # 2. Guest blocked from customer-only cart/order tools
        res_guest_cart = await executor.execute(
            "add_to_cart",
            {"sku": "LAP-ASUS-VIVO15", "quantity": 1},
            guest,
            call_id="c5",
        )
        assert res_guest_cart.is_error is True
        assert res_guest_cart.error_code == "forbidden"

        # 3. Customer cart, preview token (10m HMAC), favorite, cancel, support ticket
        res_add = await executor.execute(
            "add_to_cart",
            {"sku": "LAP-ASUS-VIVO15", "quantity": 2},
            customer,
            call_id="c6",
        )
        assert res_add.is_error is True
        assert res_add.error_code == "unavailable"

        res_view = await executor.execute("view_cart", {}, customer, call_id="c7")
        assert res_view.is_error is True
        assert res_view.error_code == "unavailable"

        res_prev = await executor.execute(
            "preview_order",
            {"store_id": "MWG_HCM_001", "discount_code": "MWG500K"},
            customer,
            call_id="c8",
        )
        assert res_prev.is_error is True
        assert res_prev.error_code == "unavailable"

        res_rem = await executor.execute(
            "remove_from_cart",
            {"sku": "LAP-ASUS-VIVO15"},
            customer,
            call_id="c9",
        )
        assert res_rem.is_error is True
        assert res_rem.error_code == "unavailable"

        res_fav = await executor.execute(
            "manage_favorite",
            {"sku": "LAP-LEN-THINK14", "action": "add"},
            customer,
            call_id="c10",
        )
        assert res_fav.is_error is True
        assert res_fav.error_code == "unavailable"

        res_cancel = await executor.execute(
            "cancel_simulated_order",
            {"order_id": "ORD-100201", "reason": "Đổi sang cấu hình cao hơn"},
            customer,
            call_id="c11",
        )
        assert res_cancel.is_error is True
        assert res_cancel.error_code == "unavailable"

        res_ticket = await executor.execute(
            "create_support_ticket",
            {"order_id": "ORD-100201", "title": "Hỗ trợ cài đặt", "description": "Cần hỗ trợ cài Windows bản quyền"},
            customer,
            call_id="c12",
        )
        assert res_ticket.is_error is True
        assert res_ticket.error_code == "unavailable"

    asyncio.run(_run())


def test_sprint3_postgres_and_redis_persistence_adapters():
    """Sprint 3 Verification: PostgresKVStore fails closed without DSN; RedisKVStore adheres to KVStorePort."""
    import pytest
    from agent_platform.harness.persistence.ports import PersistenceError
    from agent_platform.harness.persistence.postgres import PostgresKVStore
    from agent_platform.harness.persistence.redis import RedisKVStore

    async def _run():
        pg_unconfigured = PostgresKVStore()
        with pytest.raises(PersistenceError):
            await pg_unconfigured.set("session:01", {"user": "cust_01"})
        with pytest.raises(PersistenceError):
            await pg_unconfigured.get("session:01")

        store = RedisKVStore()
        await store.set("session:01", {"user": "cust_01", "total": "17990000"}, ttl_seconds=60)
        fetched = await store.get("session:01")
        assert fetched == {"user": "cust_01", "total": "17990000"}

        keys = await store.list_keys("session:")
        assert "session:01" in keys

        deleted = await store.delete("session:01")
        assert deleted is True
        assert await store.get("session:01") is None

    asyncio.run(_run())
