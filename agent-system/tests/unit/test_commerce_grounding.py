"""Graph tests use a scripted model and fake Core responses; no live integrations."""
import asyncio
from pathlib import Path

import pytest
from pydantic import BaseModel

from agent_platform.agents.workflow.builder import build_agent_graph
from agent_platform.agents.workflow.runner import AgentRunner
from agent_platform.domain.pack import DomainPack
from agent_platform.harness.governance.policy import PolicyEngine
from agent_platform.harness.state.principal import Principal
from agent_platform.harness.tools.executor import ToolExecutor
from agent_platform.harness.tools.registry import ToolRegistry
from agent_platform.harness.tools.spec import ToolContext, ToolUnavailableError, tool
from agent_platform.llm.providers.scripted import ScriptedLLM


@pytest.fixture
def graph_setup(monkeypatch):
    domain = Path('domains/retail_store')
    pack = DomainPack.load_from_dir(domain)
    registry = ToolRegistry()
    registry.load_from_module_file(domain / 'tools.py')
    async def core(endpoint, payload, ctx):
        return {'order_id': payload['order_id'], 'order_status': 'PLACED'}
    monkeypatch.setitem(registry.get('query_order_status').func.__globals__, '_call_nestjs_tool', core)
    return pack, registry, domain


def execute_graph(setup, tool_name, order_id, answer, role='customer'):
    pack, registry, domain = setup
    llm = ScriptedLLM()
    llm.queue_tool_call(tool_name, {'order_id': order_id}, 'call-1')
    llm.queue_answer(answer)
    llm.queue_answer(answer)
    executor = ToolExecutor(registry, PolicyEngine.load_from_file(domain / 'policies.yaml'))
    runner = AgentRunner(build_agent_graph(pack, llm, registry, executor))
    return asyncio.run(runner.execute('Tra cứu đơn hàng', Principal(user_id='alice', role=role)))


@pytest.mark.parametrize('tool_name,order_id', [
    ('query_order_status', 'ORD-100201'), ('lookup_order', 'MWG-20261030-A1B2C3D4'),
])
def test_confirmed_order_status_is_business_grounding_not_citation(graph_setup, tool_name, order_id):
    answer = f'Đơn hàng {order_id} có trạng thái PLACED.'
    state = execute_graph(graph_setup, tool_name, order_id, answer)
    assert state['status'] == 'done'
    assert state['grounding_status'] == 'verified_commerce'
    assert state['final_answer'] == answer
    assert state['matched_evidence'] == [] and state['grounding_score'] is None


@pytest.mark.parametrize('answer', [
    'Đơn hàng ORD-100201 có trạng thái COMPLETED.',
    'Đơn hàng ORD-100201 có trạng thái PLACED. Bạn sẽ nhận hàng ngày mai.',
])
def test_untrusted_model_answer_cannot_change_core_result(graph_setup, answer):
    state = execute_graph(graph_setup, 'query_order_status', 'ORD-100201', answer)
    assert state['status'] == 'done'
    assert state['final_answer'] == 'Đơn hàng ORD-100201 có trạng thái PLACED.'
    assert state['matched_evidence'] == []


def test_unsupported_core_status_is_unavailable(graph_setup, monkeypatch):
    _, registry, _ = graph_setup
    async def invalid(*args, **kwargs):
        return {'order_id': 'ORD-100201', 'order_status': 'SHIPPED'}
    monkeypatch.setitem(registry.get('query_order_status').func.__globals__, '_call_nestjs_tool', invalid)
    state = execute_graph(graph_setup, 'query_order_status', 'ORD-100201', 'Đơn hàng ORD-100201 có trạng thái SHIPPED.')
    assert state['status'] == 'abstained' and state.get('verified_commerce_answer') is None


def test_core_denial_or_unavailability_never_produces_a_verified_answer(graph_setup, monkeypatch):
    _, registry, _ = graph_setup
    async def denied(*args, **kwargs): return None
    monkeypatch.setitem(registry.get('query_order_status').func.__globals__, '_call_nestjs_tool', denied)
    state = execute_graph(graph_setup, 'query_order_status', 'ORD-100201', 'Đơn hàng ORD-100201 có trạng thái PLACED.')
    assert state['status'] == 'abstained' and state.get('verified_commerce_answer') is None


def test_guest_cannot_get_order_status_fact(graph_setup):
    state = execute_graph(graph_setup, 'query_order_status', 'ORD-100201', 'Đơn hàng ORD-100201 có trạng thái PLACED.', role='guest')
    assert state['status'] == 'abstained' and state.get('verified_commerce_answer') is None


@pytest.mark.parametrize('name,args,response,expected', [
    ('lookup_laptop_catalog', {}, {'count': 0, 'laptops': []}, 'Hiện chưa tìm thấy sản phẩm phù hợp với bộ lọc này.'),
    ('lookup_laptop_catalog', {}, {'count': 1, 'laptops': [{'sku': 'ABC', 'name': 'Laptop A', 'price_vnd': '100'}]}, 'ABC: Laptop A — 100 VNĐ.'),
    ('get_product_details', {'sku': 'ABC'}, {'sku': 'ABC', 'name': 'Laptop A', 'priceVnd': '100'}, 'ABC: Laptop A — 100 VNĐ.'),
    ('compare_products', {'skus': ['ABC', 'DEF']}, {'total': 2, 'comparison': [{'sku': 'ABC', 'name': 'A', 'priceVnd': '100'}, {'sku': 'DEF', 'name': 'B', 'priceVnd': '200'}]}, 'DEF: B — 200 VNĐ.'),
])
def test_catalog_results_are_rendered_by_server(graph_setup, monkeypatch, name, args, response, expected):
    pack, registry, domain = graph_setup
    async def core(*unused, **kwargs): return response
    monkeypatch.setitem(registry.get(name).func.__globals__, '_call_nestjs_tool', core)
    llm = ScriptedLLM()
    llm.queue_tool_call(name, args, 'catalog-call')
    llm.queue_answer('Thông tin không có căn cứ.')
    runner = AgentRunner(build_agent_graph(pack, llm, registry, ToolExecutor(registry, PolicyEngine.load_from_file(domain / 'policies.yaml'))))
    state = asyncio.run(runner.execute('Tìm sản phẩm', Principal(user_id='guest', role='guest')))
    assert state['status'] == 'done' and state['grounding_status'] == 'verified_commerce'
    assert expected in state['final_answer'] and 'không có căn cứ' not in state['final_answer']
    assert len(llm.history_calls) == 1 and state['matched_evidence'] == []


@pytest.mark.parametrize('sku,store_code,status', [('ABC', 'MWG_HCM_001', 'done'), ('OTHER', 'MWG_HCM_001', 'abstained'), ('ABC', 'OTHER', 'abstained')])
def test_inventory_requires_matching_product_and_store(graph_setup, monkeypatch, sku, store_code, status):
    pack, registry, domain = graph_setup
    async def core(*unused, **kwargs):
        return {'sku': sku, 'store_id': 'store-1', 'store_code': store_code, 'available_qty': 2,
                'reservation_guarantee': 'not verified'}
    monkeypatch.setitem(registry.get('check_inventory').func.__globals__, '_call_nestjs_tool', core)
    llm = ScriptedLLM()
    llm.queue_tool_call('check_inventory', {'sku': 'ABC'}, 'inventory-call')
    llm.queue_answer('Bịa kết quả.')
    runner = AgentRunner(build_agent_graph(pack, llm, registry, ToolExecutor(registry, PolicyEngine.load_from_file(domain / 'policies.yaml'))))
    state = asyncio.run(runner.execute('Còn hàng không?', Principal(user_id='guest', role='guest')))
    assert state['status'] == status and state['matched_evidence'] == []
    if status == 'done':
        assert 'ABC còn 2' in state['final_answer'] and 'not verified' not in state['final_answer']
        assert len(llm.history_calls) == 1


@pytest.mark.parametrize('customer_id,total_vnd,expected_status', [('alice', '220', 'done'), ('bob', '220', 'abstained'), ('alice', '221', 'abstained')])
def test_cart_requires_owner_and_consistent_amounts(graph_setup, monkeypatch, customer_id, total_vnd, expected_status):
    pack, registry, domain = graph_setup
    async def core(*unused, **kwargs):
        return {'customer_id': customer_id, 'total_items': 2, 'subtotal_vnd': '200', 'vat_vnd': '20', 'total_vnd': total_vnd,
                'items': [{'sku': 'ABC', 'name': 'Laptop A', 'quantity': 2, 'unit_price_vnd': '100', 'line_total_vnd': '200'}]}
    monkeypatch.setitem(registry.get('view_cart').func.__globals__, '_call_nestjs_tool', core)
    llm = ScriptedLLM()
    llm.queue_tool_call('view_cart', {}, 'cart-call')
    llm.queue_answer('Thông tin không có căn cứ.')
    runner = AgentRunner(build_agent_graph(pack, llm, registry, ToolExecutor(registry, PolicyEngine.load_from_file(domain / 'policies.yaml'))))
    state = asyncio.run(runner.execute('Xem giỏ hàng', Principal(user_id='alice', role='customer')))
    assert state['status'] == expected_status and state['matched_evidence'] == []
    if expected_status == 'done':
        assert 'ABC: Laptop A' in state['final_answer'] and 'tổng: 220 VNĐ' in state['final_answer']
        assert len(llm.history_calls) == 1
    else:
        assert '220 VNĐ' not in state['final_answer']


def test_source_label_alone_cannot_create_business_grounding(graph_setup):
    pack, registry, domain = graph_setup
    class Input(BaseModel):
        order_id: str
    @tool(name='query_order_status', description='test', input_model=Input, allowed_roles=['customer'])
    async def fake(args: Input, ctx: ToolContext):
        return {'status': 'success', 'source': 'nestjs_commerce_ssot', 'order_id': args.order_id, 'order_status': 'PLACED'}
    registry.register(fake)
    state = execute_graph((pack, registry, domain), 'query_order_status', 'ORD-100201', 'Đơn hàng ORD-100201 có trạng thái PLACED.')
    assert state['status'] == 'abstained' and state.get('verified_commerce_answer') is None


def test_post_dispatch_failure_is_unknown_outcome_not_success(graph_setup):
    pack, registry, domain = graph_setup
    class Input(BaseModel):
        order_id: str
    @tool(name='cancel_simulated_order', description='test', input_model=Input, allowed_roles=['customer'], side_effect=True)
    async def uncertain(args: Input, ctx: ToolContext):
        ctx.outcome_ambiguous = True
        raise ToolUnavailableError('Không thể xác nhận; cần kiểm tra trước khi thử lại.')
    registry.register(uncertain)
    llm = ScriptedLLM()
    llm.queue_tool_call('cancel_simulated_order', {'order_id': 'ORD-100201'}, 'call-1')
    llm.queue_answer('Đơn hàng đã hủy thành công.')
    executor = ToolExecutor(registry, PolicyEngine.load_from_file(domain / 'policies.yaml'))
    runner = AgentRunner(build_agent_graph(pack, llm, registry, executor))
    state = asyncio.run(runner.execute('Hủy đơn', Principal(user_id='alice', role='customer')))
    assert state['status'] == 'unknown_outcome'
    assert 'đã hủy thành công' not in state['final_answer']
    assert state['matched_evidence'] == [] and len(llm.history_calls) == 1


def test_active_domain_knowledge_tool_stays_unavailable(graph_setup):
    pack, registry, domain = graph_setup
    llm = ScriptedLLM()
    llm.queue_tool_call('search_knowledge', {'query': 'đổi trả'}, 'policy-call')
    executor = ToolExecutor(registry, PolicyEngine.load_from_file(domain / 'policies.yaml'))
    runner = AgentRunner(build_agent_graph(pack, llm, registry, executor))
    state = asyncio.run(runner.execute('Chính sách đổi trả?', Principal(user_id='alice', role='customer')))
    assert state['status'] == 'abstained'
    assert state['matched_evidence'] == [] and state.get('verified_commerce_answer') is None
    assert '30 ngày' not in state['final_answer']


def test_loading_domain_does_not_initialize_unverified_retrieval(monkeypatch):
    from agent_platform.rag.retrieval.hybrid_engine import ProductionHybridRetriever
    def forbidden_init(*args, **kwargs):
        raise AssertionError('unverified index must not be initialized')
    monkeypatch.setattr(ProductionHybridRetriever, '__init__', forbidden_init)
    registry = ToolRegistry()
    registry.load_from_module_file(Path('domains/retail_store/tools.py'))
    assert registry.get('search_knowledge') is not None


def test_business_fact_is_not_reused_on_a_later_turn(graph_setup):
    from langgraph.checkpoint.memory import MemorySaver
    pack, registry, domain = graph_setup
    llm = ScriptedLLM()
    llm.queue_tool_call('query_order_status', {'order_id': 'ORD-100201'}, 'call-1')
    answer = 'Đơn hàng ORD-100201 có trạng thái PLACED.'
    llm.queue_answer(answer)
    llm.queue_answer(answer)
    llm.queue_answer(answer)
    executor = ToolExecutor(registry, PolicyEngine.load_from_file(domain / 'policies.yaml'))
    runner = AgentRunner(build_agent_graph(pack, llm, registry, executor, checkpointer=MemorySaver()))
    async def run():
        principal = Principal(user_id='alice', role='customer')
        first = await runner.execute('Tra cứu đơn', principal, thread_id='test-thread')
        second = await runner.execute('Kiểm tra lại đơn', principal, thread_id='test-thread')
        assert first['grounding_status'] == 'verified_commerce' and first['status'] == 'done'
        assert second['status'] == 'abstained' and second.get('verified_commerce_answer') is None
    asyncio.run(run())


def test_http_and_sse_expose_business_grounding_without_document_citations(graph_setup):
    from types import SimpleNamespace
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from agent_platform.api.deps import get_optional_principal
    from agent_platform.api.routers import chat
    from agent_platform.harness.persistence.memory.adapter import MemoryKVStore

    app = FastAPI()
    app.include_router(chat.router)
    app.dependency_overrides[get_optional_principal] = lambda: Principal(user_id='alice', role='customer')
    async def execute(query, principal, thread_id):
        pack, registry, domain = graph_setup
        llm = ScriptedLLM()
        llm.queue_tool_call('query_order_status', {'order_id': 'ORD-100201'}, 'call-1')
        llm.queue_answer('Đơn hàng ORD-100201 có trạng thái PLACED.')
        executor = ToolExecutor(registry, PolicyEngine.load_from_file(domain / 'policies.yaml'))
        return await AgentRunner(build_agent_graph(pack, llm, registry, executor)).execute(query, principal, thread_id=thread_id)
    app.state.harness = SimpleNamespace(kv_store=MemoryKVStore(), execute=execute)
    with TestClient(app) as client:
        result = client.post('/v1/chat', json={'query': 'Tra cứu đơn hàng'})
        assert result.status_code == 200
        assert result.json()['grounding_status'] == 'verified_commerce'
        assert result.json()['citations'] == []
        response = client.post('/v1/chat/stream', json={'query': 'Tra cứu đơn hàng'})
        assert response.status_code == 200
        assert 'verified_commerce' in response.text and 'citations' not in response.text


def test_legacy_http_and_sse_do_not_report_unknown_outcome_as_success():
    from types import SimpleNamespace
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from agent_platform.api.deps import get_optional_principal
    from agent_platform.api.routers import web_client
    from agent_platform.harness.persistence.memory.adapter import MemoryKVStore

    app = FastAPI()
    app.include_router(web_client.router)
    app.dependency_overrides[get_optional_principal] = lambda: Principal(user_id='alice', role='customer')
    async def execute(query, principal, thread_id):
        return {'thread_id': thread_id, 'run_id': 'test', 'status': 'unknown_outcome',
                'final_answer': 'Chưa xác nhận được thao tác.', 'tool_events': [], 'matched_evidence': []}
    app.state.harness = SimpleNamespace(kv_store=MemoryKVStore(), execute=execute, pack=SimpleNamespace(pack_dir=None))
    with TestClient(app) as client:
        result = client.post('/api/chat', json={'query': 'Kiểm tra thao tác'})
        assert result.status_code == 200 and result.json()['status'] == 'unknown_outcome'
        response = client.post('/api/chat/stream', json={'query': 'Kiểm tra thao tác'})
        assert response.status_code == 200 and 'unknown_outcome' in response.text


@pytest.mark.parametrize('name,args,response,expected', [
    ('add_to_cart', {'sku': 'ABC', 'quantity': 2}, {'status': 'success', 'cart': {'customer_id': 'alice', 'items': []}}, 'Đã xác nhận thêm 2 sản phẩm ABC'),
    ('remove_from_cart', {'sku': 'ABC'}, {'status': 'success', 'cart': {'customer_id': 'alice', 'items': []}}, 'Đã xác nhận xóa sản phẩm ABC'),
    ('cancel_simulated_order', {'order_id': 'ORD-100201', 'reason': 'không cần'}, {'status': 'success', 'order_id': 'ORD-100201', 'action': 'CANCELLED'}, 'Đã xác nhận hủy đơn hàng ORD-100201'),
    ('create_support_ticket', {'order_id': 'ORD-100201', 'title': 'Cần hỗ trợ', 'description': 'Xin kiểm tra đơn'}, {'status': 'success', 'ticket_id': 'TCK-123', 'ticket': {'ticketCode': 'TCK-123', 'customerId': 'alice'}}, 'Đã xác nhận tạo phiếu hỗ trợ TCK-123'),
    ('manage_favorite', {'sku': 'ABC', 'action': 'toggle'}, {'status': 'success', 'customer_id': 'alice', 'sku': 'ABC', 'action': 'toggle', 'is_favorited': False}, 'ABC không còn trong danh sách yêu thích'),
])
def test_write_contract_answer_and_replay(graph_setup, monkeypatch, name, args, response, expected):
    pack, registry, domain = graph_setup
    calls = []
    async def core(endpoint, payload, ctx):
        calls.append(endpoint)
        ctx.outcome_ambiguous = True
        return response
    monkeypatch.setitem(registry.get(name).func.__globals__, '_call_nestjs_tool', core)
    executor = ToolExecutor(registry, PolicyEngine.load_from_file(domain / 'policies.yaml'))
    async def run():
        principal = Principal(user_id='alice', role='customer')
        first = await executor.execute(name, args, principal, thread_id='thread', call_id='call')
        replay = await executor.execute(name, args, principal, thread_id='thread', call_id='call')
        assert not first.is_error and expected in first.commerce_answer
        assert replay.commerce_answer == first.commerce_answer
        assert len(calls) == 1
        llm = ScriptedLLM()
        llm.queue_tool_call(name, args, 'graph-call')
        llm.queue_answer('Bịa kết quả khác.')
        runner = AgentRunner(build_agent_graph(pack, llm, registry, executor))
        state = await runner.execute('Thực hiện thao tác', principal)
        assert state['status'] == 'done' and expected in state['final_answer']
        assert state['matched_evidence'] == [] and len(llm.history_calls) == 1
    asyncio.run(run())


@pytest.mark.parametrize('name,args,response', [
    ('add_to_cart', {'sku': 'ABC'}, {'status': 'success', 'cart': {'customer_id': 'bob', 'items': []}}),
    ('remove_from_cart', {'sku': 'ABC'}, {'status': 'success', 'cart': {}}),
    ('cancel_simulated_order', {'order_id': 'ORD-100201', 'reason': 'không cần'}, {'status': 'success', 'order_id': 'ORD-100201', 'action': 'PENDING'}),
    ('create_support_ticket', {'title': 'Cần hỗ trợ', 'description': 'Xin kiểm tra đơn'}, {'status': 'success', 'ticket_id': 'TCK-123', 'ticket': {'ticketCode': 'TCK-123', 'customerId': 'bob'}}),
    ('manage_favorite', {'sku': 'ABC', 'action': 'add'}, {'status': 'success', 'customer_id': 'alice', 'sku': 'ABC', 'action': 'add', 'is_favorited': 'true'}),
])
def test_malformed_write_result_is_unknown_and_blocks_new_call(graph_setup, monkeypatch, name, args, response):
    _, registry, domain = graph_setup
    calls = []
    async def core(endpoint, payload, ctx):
        calls.append(endpoint)
        ctx.outcome_ambiguous = True
        return response
    monkeypatch.setitem(registry.get(name).func.__globals__, '_call_nestjs_tool', core)
    executor = ToolExecutor(registry, PolicyEngine.load_from_file(domain / 'policies.yaml'))
    async def run():
        principal = Principal(user_id='alice', role='customer')
        first = await executor.execute(name, args, principal, thread_id='thread', call_id='one')
        second = await executor.execute(name, args, principal, thread_id='thread', call_id='two')
        assert first.error_code == second.error_code == 'unknown_outcome'
        assert first.commerce_answer is None and len(calls) == 1
    asyncio.run(run())


@pytest.mark.parametrize('dispatched,expected_status,expected_text', [
    (False, 'abstained', 'Thao tác thất bại hoặc chưa được gửi'),
    (True, 'unknown_outcome', 'Chưa xác định được kết quả thao tác'),
])
def test_write_failures_render_without_model(graph_setup, monkeypatch, dispatched, expected_status, expected_text):
    pack, registry, domain = graph_setup
    async def core(endpoint, payload, ctx):
        ctx.outcome_ambiguous = dispatched
        return None
    monkeypatch.setitem(registry.get('add_to_cart').func.__globals__, '_call_nestjs_tool', core)
    llm = ScriptedLLM()
    llm.queue_tool_call('add_to_cart', {'sku': 'ABC'}, 'call')
    llm.queue_answer('Đã thêm thành công.')
    executor = ToolExecutor(registry, PolicyEngine.load_from_file(domain / 'policies.yaml'))
    state = asyncio.run(AgentRunner(build_agent_graph(pack, llm, registry, executor)).execute(
        'Thêm vào giỏ', Principal(user_id='alice', role='customer')))
    assert state['status'] == expected_status and expected_text in state['final_answer']
    assert len(llm.history_calls) == 1 and state['matched_evidence'] == []


def test_multiple_tool_calls_with_write_are_not_dispatched(graph_setup, monkeypatch):
    from agent_platform.agents.workflow.nodes.tool_exec import create_tool_exec_node
    _, registry, domain = graph_setup
    calls = []
    async def core(*args, **kwargs):
        calls.append(1)
        return None
    monkeypatch.setitem(registry.get('add_to_cart').func.__globals__, '_call_nestjs_tool', core)
    executor = ToolExecutor(registry, PolicyEngine.load_from_file(domain / 'policies.yaml'))
    state = {'principal': Principal(user_id='alice', role='customer'),
             'pending_tool_calls': [{'name': 'add_to_cart', 'arguments': {'sku': 'ABC'}, 'id': '1'},
                                    {'name': 'view_cart', 'arguments': {}, 'id': '2'}]}
    result = asyncio.run(create_tool_exec_node(executor)(state))
    assert result['status'] == 'abstained' and calls == []


def test_real_harness_requires_operation_id_before_write(graph_setup, monkeypatch):
    from agent_platform.agents.workflow.nodes.tool_exec import create_tool_exec_node
    _, registry, domain = graph_setup
    calls = []
    async def core(*args, **kwargs):
        calls.append(1)
    monkeypatch.setitem(registry.get('add_to_cart').func.__globals__, '_call_nestjs_tool', core)
    executor = ToolExecutor(registry, PolicyEngine.load_from_file(domain / 'policies.yaml'))
    state = {'principal': Principal(user_id='alice', role='customer'), 'require_operation_id': True,
             'pending_tool_calls': [{'name': 'add_to_cart', 'arguments': {'sku': 'ABC'}, 'id': '1'}]}
    result = asyncio.run(create_tool_exec_node(executor)(state))
    assert result['status'] == 'abstained' and 'thiếu mã' in result['final_answer'] and not calls


def test_graph_propagates_operation_id_to_core(graph_setup, monkeypatch):
    pack, registry, domain = graph_setup
    seen = []
    async def core(endpoint, payload, ctx):
        seen.append(ctx.idempotency_key)
        return {'status': 'success', 'customer_id': 'alice', 'sku': 'ABC', 'action': 'add', 'is_favorited': True}
    monkeypatch.setitem(registry.get('manage_favorite').func.__globals__, '_call_nestjs_tool', core)
    llm = ScriptedLLM()
    llm.queue_tool_call('manage_favorite', {'sku': 'ABC', 'action': 'add'}, 'model-call')
    runner = AgentRunner(build_agent_graph(pack, llm, registry, ToolExecutor(registry, PolicyEngine.load_from_file(domain / 'policies.yaml'))))
    operation_id = '9d493fb7-ef26-4fc2-8e55-0d131047d21b'
    state = asyncio.run(runner.execute('Yêu thích ABC', Principal(user_id='alice', role='customer'), operation_id=operation_id, require_operation_id=True))
    assert state['status'] == 'done' and seen == [operation_id]


def test_operation_status_forwards_authenticated_identity_and_never_retries():
    import httpx
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from agent_platform.api.deps import get_optional_principal
    from agent_platform.api.routers import web_client
    from agent_platform.request_credentials import RequestCredentialMiddleware
    seen = []
    def core(request):
        seen.append(request)
        return httpx.Response(200, json={'outcome': 'confirmed', 'operation': 'manage_favorite'})
    app = FastAPI()
    app.add_middleware(RequestCredentialMiddleware)
    app.include_router(web_client.router)
    app.dependency_overrides[get_optional_principal] = lambda: Principal(user_id='alice', role='customer')
    app.state.commerce_transport = httpx.MockTransport(core)
    operation_id = '9d493fb7-ef26-4fc2-8e55-0d131047d21b'
    with TestClient(app) as client:
        response = client.post('/api/chat/operation-status', json={'operation_id': operation_id}, headers={'Authorization': 'Bearer test'})
        assert response.status_code == 200 and response.json()['outcome'] == 'confirmed'
        assert len(seen) == 1 and seen[0].url.path.endswith('/operation-status')
        assert seen[0].headers['idempotency-key'] == operation_id
        assert seen[0].headers['authorization'] == 'Bearer test'
        app.state.commerce_transport = httpx.MockTransport(lambda request: httpx.Response(200, json={'outcome': 'success'}))
        bad = client.post('/api/chat/operation-status', json={'operation_id': operation_id}, headers={'Authorization': 'Bearer test'})
        assert bad.status_code == 503
        invalid = client.post('/api/chat/operation-status', json={'operation_id': 'not-a-uuid'}, headers={'Authorization': 'Bearer test'})
        assert invalid.status_code == 422
