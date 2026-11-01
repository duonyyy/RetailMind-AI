import asyncio
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx
import pytest

from agent_platform.harness.governance.policy import PolicyEngine
from agent_platform.harness.state.principal import Principal
from agent_platform.harness.tools.executor import ToolExecutor
from agent_platform.harness.tools.idempotency import IdempotencyManager
from agent_platform.harness.tools.registry import ToolRegistry
from agent_platform.request_credentials import _authorization


def test_concurrent_different_call_ids_block_same_pending_intent():
    manager = IdempotencyManager()
    def reserve(key):
        return manager.begin_execution(key, tenant_id='tenant', user_id='alice', tool_name='add_to_cart', arguments={'sku': 'ABC'})
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(reserve, ['call-a', 'call-b']))
    assert sorted(result.action for result in results) == ['proceed', 'unknown_outcome']
    manager.mark_unknown_outcome(next(k for k, value in manager._records.items() if value['status'] == 'in_progress'))
    assert reserve('call-c').action == 'unknown_outcome'
    assert manager.begin_execution('call-other', tenant_id='tenant', user_id='bob', tool_name='add_to_cart', arguments={'sku': 'ABC'}).action == 'proceed'


@pytest.mark.parametrize('failure', ['http_500', 'invalid_response', 'post_send_exception'])
def test_ambiguous_backend_response_blocks_new_call_id(monkeypatch, failure):
    registry = ToolRegistry()
    registry.load_from_module_file(Path('domains/retail_store/tools.py'))
    module = registry.get('add_to_cart').func.__globals__
    module['_NESTJS_OFFLINE_UNTIL'] = 0
    calls = []

    class Client:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def post(self, url, json, headers):
            calls.append(url)
            if failure == 'post_send_exception':
                raise httpx.ReadTimeout('read timeout')
            if failure == 'http_500':
                return httpx.Response(500, json={})
            return httpx.Response(200, json={'data': {'status': 'success'}})

    monkeypatch.setattr(httpx, 'AsyncClient', Client)
    executor = ToolExecutor(registry, PolicyEngine.load_from_file('domains/retail_store/policies.yaml'))
    principal = Principal(user_id='alice', role='customer')

    async def run():
        token = _authorization.set('Bearer test-only')
        try:
            first = await executor.execute('add_to_cart', {'sku': 'ABC'}, principal, thread_id='one', call_id='call-a')
            second = await executor.execute('add_to_cart', {'sku': 'ABC'}, principal, thread_id='two', call_id='call-b')
        finally:
            _authorization.reset(token)
        assert first.is_error and second.error_code == 'unknown_outcome'
        assert len(calls) == 1
        assert not executor.idempotency._store
    asyncio.run(run())


def test_backend_receives_uuid4_key_and_same_call_replays_without_dispatch(monkeypatch):
    registry = ToolRegistry()
    registry.load_from_module_file(Path('domains/retail_store/tools.py'))
    module = registry.get('create_support_ticket').func.__globals__
    module['_NESTJS_OFFLINE_UNTIL'] = 0
    headers_seen = []
    class Client:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def post(self, url, json, headers):
            headers_seen.append(headers)
            return httpx.Response(200, json={'data': {'status': 'success', 'ticket_id': 'TCK-1', 'ticket': {'ticketCode': 'TCK-1', 'customerId': 'alice'}}})
    monkeypatch.setattr(httpx, 'AsyncClient', Client)
    executor = ToolExecutor(registry, PolicyEngine.load_from_file('domains/retail_store/policies.yaml'))
    principal = Principal(user_id='alice', role='customer')
    async def run():
        token = _authorization.set('Bearer test-only')
        try:
            args = {'order_id': 'ORD-100201', 'title': 'Hỗ trợ', 'description': 'Cần được hỗ trợ'}
            first = await executor.execute('create_support_ticket', args, principal, thread_id='thread', call_id='call')
            again = await executor.execute('create_support_ticket', args, principal, thread_id='thread', call_id='call')
        finally:
            _authorization.reset(token)
        assert not first.is_error and not again.is_error and first.output == again.output
        assert len(headers_seen) == 1
        backend_key = headers_seen[0]['Idempotency-Key']
        assert uuid.UUID(backend_key).version == 4
        assert next(iter(executor.idempotency._records.values()))['backend_idempotency_key'] == backend_key
    asyncio.run(run())


def test_stable_operation_id_replays_across_new_tool_call_ids(monkeypatch):
    registry = ToolRegistry()
    registry.load_from_module_file(Path('domains/retail_store/tools.py'))
    calls = []
    async def backend(endpoint, payload, ctx):
        calls.append(ctx.idempotency_key)
        return {'status': 'success', 'customer_id': 'alice', 'sku': 'ABC', 'action': 'add', 'is_favorited': True}
    monkeypatch.setitem(registry.get('manage_favorite').func.__globals__, '_call_nestjs_tool', backend)
    executor = ToolExecutor(registry, PolicyEngine.load_from_file('domains/retail_store/policies.yaml'))
    principal = Principal(user_id='alice', role='customer')
    operation_id = str(uuid.uuid4())
    async def run():
        args = {'sku': 'ABC', 'action': 'add'}
        first = await executor.execute('manage_favorite', args, principal, thread_id='one', call_id='one', operation_id=operation_id)
        second = await executor.execute('manage_favorite', args, principal, thread_id='two', call_id='two', operation_id=operation_id)
        conflict = await executor.execute('manage_favorite', {'sku': 'DEF', 'action': 'add'}, principal, call_id='three', operation_id=operation_id)
        assert first.commerce_answer == second.commerce_answer and not second.is_error
        assert conflict.error_code == 'idempotency_conflict'
        assert calls == [operation_id]
    asyncio.run(run())


def test_invalid_operation_id_never_dispatches(monkeypatch):
    registry = ToolRegistry()
    registry.load_from_module_file(Path('domains/retail_store/tools.py'))
    calls = []
    async def backend(*args):
        calls.append(1)
    monkeypatch.setitem(registry.get('manage_favorite').func.__globals__, '_call_nestjs_tool', backend)
    executor = ToolExecutor(registry, PolicyEngine.load_from_file('domains/retail_store/policies.yaml'))
    result = asyncio.run(executor.execute('manage_favorite', {'sku': 'ABC'}, Principal(user_id='alice', role='customer'), operation_id='invalid'))
    assert result.is_error and result.error_code == 'validation_error' and calls == []
