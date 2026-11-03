"""Small opt-in live smoke test. Never prints credentials or changes inventory.

Run after Compose starts. --customer creates a uniquely named test customer,
    cart and favorite; these records are retained as evidence.
"""
import argparse
import json
import subprocess
import time
import uuid
from pathlib import Path

import httpx


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--customer', action='store_true')
    parser.add_argument('--restart-agent', action='store_true', help='Restart the development Agent container and verify durable replay')
    parser.add_argument('--output', default='.test-rag-work/live-runtime.json')
    args = parser.parse_args()
    results = []
    marker = 'live_' + uuid.uuid4().hex[:12]

    def record(name, response, check=lambda d: True):
        try:
            data = response.json()
        except ValueError:
            data = {'body_excerpt': response.text[:120]}
        if isinstance(data, dict) and 'data' in data and ('success' in data or 'statusCode' in data):
            data = data['data']
        ok = response.is_success and check(data)
        row = {'case': name, 'http_status': response.status_code, 'passed': bool(ok), 'data': data}
        results.append(row)
        summary = {k: v for k, v in row.items() if k != 'data'}
        if isinstance(data, dict):
            summary['response'] = {k: data[k] for k in ('status', 'grounding_status', 'final_answer', 'thought_trace', 'message', 'total', 'outcome') if k in data}
        print(json.dumps(summary, ensure_ascii=False), flush=True)
        return data

    with httpx.Client(base_url='http://localhost:4000/api/v1/', timeout=30) as core, httpx.Client(base_url='http://localhost:8000/', timeout=150) as agent:
        catalog = record('core_catalog', core.get('catalog/products'), lambda d: isinstance(d.get('items'), list))
        stores = record('core_stores', core.get('inventory/stores'))
        record('agent_liveness', agent.get('health/live'))
        denial = core.get('cart')
        results.append({'case': 'core_guest_cart_denied', 'http_status': denial.status_code, 'passed': denial.status_code in (401, 403)})
        print(json.dumps(results[-1]), flush=True)
        frontend = httpx.get('http://localhost:3000/', timeout=30)
        results.append({'case': 'frontend_home', 'http_status': frontend.status_code, 'passed': frontend.status_code == 200})
        sse = httpx.post('http://localhost:3000/api/proxy/chat/stream', json={'query': 'Tra cứu danh mục laptop và giá hiện có trong hệ thống.'}, timeout=150)
        events = [json.loads(line[6:]) for line in sse.text.splitlines() if line.startswith('data: ') and line[6:] != '[DONE]']
        answer = next((e for e in events if e.get('type') == 'answer'), {})
        results.append({'case': 'frontend_bff_sse_gemini_catalog', 'http_status': sse.status_code,
                        'passed': sse.status_code == 200 and 'data: [DONE]' in sse.text and answer.get('status') == 'done', 'data': answer})
        print(json.dumps({k: v for k, v in results[-1].items() if k != 'data'}), flush=True)

        def chat(name, query, headers=None, operation=None):
            payload = {'query': query}
            if operation:
                payload['operation_id'] = operation
            started = time.monotonic()
            data = record(name, agent.post('api/chat', json=payload, headers=headers),
                          lambda d: d.get('status') == 'success' and d.get('grounding_status') == 'verified_commerce')
            results[-1]['elapsed_s'] = round(time.monotonic() - started, 2)
            return data

        chat('gemini_guest_catalog', 'Tra cứu danh mục laptop hiện có trong hệ thống và giá đã xác nhận. Hãy gọi công cụ danh mục.')
        items = catalog.get('items', [])
        if items:
            sku = items[0]['sku']
            chat('gemini_product_detail', f'Tra cứu chi tiết và giá hiện tại của sản phẩm có SKU chính xác {sku}.')
        else:
            sku = None
        if args.customer:
            password = uuid.uuid4().hex + 'Aa!9'
            email = marker + '@example.invalid'
            user = record('register_test_customer', core.post('auth/register', json={
                'email': email, 'password': password, 'fullName': 'RetailMind runtime test ' + marker,
                'phone': '0900000000',
            }))
            record('login_test_customer', core.post('auth/login', json={'email': email, 'password': password}))
            token = core.cookies.get('access_token')
            if token:
                headers = {'Authorization': 'Bearer ' + token}
                core.headers.update(headers)
                record('authenticated_profile', core.get('auth/me'))
                chat('gemini_customer_cart', 'Xem giỏ hàng hiện tại của tôi.', headers)
                if sku and stores:
                    store_items = stores if isinstance(stores, list) else stores.get('items', [])
                    store_code = store_items[0]['code']
                    operation = str(uuid.uuid4())
                    query = f'Thêm đúng 1 sản phẩm SKU {sku} vào giỏ hàng của tôi tại cửa hàng {store_code}. Truyền store_id chính xác {store_code}. Chỉ thực hiện thao tác thêm vào giỏ.'
                    chat('gemini_add_cart', query, headers, operation)
                    chat('gemini_add_cart_replay', query, headers, operation)
                    record('core_cart_after_replay', core.get('cart'), lambda d: sum(x.get('quantity', 0) for x in d.get('items', [])) == 1)
                    record('operation_receipt', agent.post('api/chat/operation-status', json={'operation_id': operation}, headers=headers), lambda d: d.get('outcome') == 'confirmed')
                    if args.restart_agent:
                        subprocess.run(['docker', 'restart', 'retailmind_agent_python'], check=True, capture_output=True, timeout=45)
                        deadline = time.monotonic() + 30
                        while True:
                            try:
                                if agent.get('health/live').status_code == 200:
                                    break
                            except httpx.HTTPError:
                                pass
                            if time.monotonic() > deadline:
                                raise RuntimeError('Agent did not restart within 30 seconds')
                            time.sleep(0.5)
                        chat('gemini_add_cart_replay_after_restart', query, headers, operation)
                        record('core_cart_after_restart_replay', core.get('cart'), lambda d: sum(x.get('quantity', 0) for x in d.get('items', [])) == 1)
                    operation = str(uuid.uuid4())
                    query = f'Thêm sản phẩm SKU {sku} vào danh sách yêu thích của tôi với action add.'
                    chat('gemini_favorite_add', query, headers, operation)
                    chat('gemini_favorite_add_replay', query, headers, operation)
                    record('core_favorites_after_replay', core.get('customers/favorites'), lambda d: len(d.get('favorites', [])) == 1)
                operation = str(uuid.uuid4())
                query = f'Tạo phiếu hỗ trợ không gắn đơn hàng, tiêu đề "Runtime test {marker}", nội dung "Kiểm tra tích hợp Gemini thật với Core và PostgreSQL trong môi trường phát triển."'
                record('gemini_ticket_missing_order_fails_closed', agent.post('api/chat', json={'query': query, 'operation_id': operation}, headers=headers),
                       lambda d: d.get('status') != 'success')
                record('core_no_unowned_ticket_created', core.get('support/tickets'), lambda d: not d if isinstance(d, list) else not d.get('tickets', d.get('items', [])))
            else:
                results.append({'case': 'authenticated_cases', 'passed': False, 'reason': 'No access cookie'})
    target = Path(args.output)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps({'run': marker, 'results': results}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'report': str(target), 'passed': sum(r['passed'] for r in results), 'total': len(results)}))
    return 0 if all(r['passed'] for r in results) else 1


if __name__ == '__main__':
    raise SystemExit(main())
