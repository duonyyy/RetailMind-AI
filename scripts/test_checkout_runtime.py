"""Real HTTP/BFF/PostgreSQL checkout checks on disposable, labeled containers."""
import argparse
import concurrent.futures
import json
import subprocess
import time
import uuid
from pathlib import Path

import httpx
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--keep-running', action='store_true')
    args = parser.parse_args()
    tag = 'checkout-' + uuid.uuid4().hex[:10]
    password = uuid.uuid4().hex
    jwt = uuid.uuid4().hex
    secret = uuid.uuid4().hex
    settings = dotenv_values(ROOT / '.env')
    containers = []
    checks = []
    folder = ROOT / '.test-rag-work'
    folder.mkdir(exist_ok=True)
    report = folder / 'checkout-runtime.json'

    def docker(*command, input=None):
        r = subprocess.run(['docker', *command], input=input, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=180)
        if r.returncode:
            error = r.stderr
            for value in (password, jwt, secret, *[v for k, v in settings.items() if v and ('SECRET' in k or 'PASSWORD' in k)]):
                error = error.replace(value, '[REDACTED]')
            raise RuntimeError(f'Docker {command[0]} failed: {error[:700]}')
        return r.stdout.strip()

    network = next(iter(json.loads(docker('inspect', 'retailmind_postgres'))[0]['NetworkSettings']['Networks']))

    def start(name, image, env, port):
        command = ['run', '-d', '--rm', '--name', name, '--label', 'retailmind.fixture=' + tag, '--network', network, '-p', f'127.0.0.1::{port}']
        for k, v in env.items():
            command += ['-e', f'{k}={v}']
        container = docker(*command, image)
        containers.append(container)
        mapping = docker('port', container, str(port) + '/tcp')
        return container, 'http://127.0.0.1:' + mapping.rsplit(':', 1)[1]

    def sql(text):
        return docker('exec', '-i', pg, 'psql', '-U', 'retailmind_user', '-d', 'retailmind_db', '-v', 'ON_ERROR_STOP=1', '-At', input=text)

    def check(name, condition, details=None):
        row = {'case': name, 'passed': bool(condition)}
        if details is not None:
            row['details'] = details
        checks.append(row)
        print(json.dumps(row, ensure_ascii=False), flush=True)
        if not condition:
            raise AssertionError(name)

    def unpack(response):
        d = response.json()
        return d['data'] if isinstance(d, dict) and (d.get('success') is True or d.get('status') == 'success') and 'data' in d else d

    def ready(url):
        deadline = time.monotonic() + 50
        while time.monotonic() < deadline:
            try:
                if httpx.get(url, timeout=2).status_code == 200:
                    return
            except httpx.HTTPError:
                pass
            time.sleep(0.5)
        raise RuntimeError('Fixture did not become ready')

    success = False
    try:
        pg, _ = start(tag + '-pg', 'postgres:16-alpine', {'POSTGRES_USER': 'retailmind_user', 'POSTGRES_DB': 'retailmind_db', 'POSTGRES_PASSWORD': password}, 5432)
        for _ in range(40):
            try:
                sql('SELECT 1;')
                break
            except RuntimeError:
                time.sleep(0.5)
        env = {'DB_HOST': tag + '-pg', 'DB_PORT': '5432', 'DB_DATABASE': 'retailmind_db', 'DB_USERNAME': 'retailmind_user', 'DB_PASSWORD': password, 'NODE_ENV': 'production', 'JWT_SECRET': jwt}
        command = ['run', '--rm', '--network', network]
        for k, v in env.items():
            command += ['-e', f'{k}={v}']
        docker(*command, 'retailmind_ai-backend', 'node', 'node_modules/typeorm/cli.js', 'migration:run', '-d', 'dist/database/data-source.js')
        sql(f"CREATE ROLE retailmind_app_runtime LOGIN PASSWORD '{password}';")
        grants = (ROOT / 'scripts/runtime-scoped-grants.sql').read_text(encoding='utf-8').split('-- Agent runtime role')[0]
        sql(grants + '\nCOMMIT;')
        a, b, brand, category, product, v1, v2 = [str(uuid.uuid4()) for _ in range(7)]
        sql(f"""
        INSERT INTO roles(code,name) VALUES ('CUSTOMER','Customer');
        INSERT INTO brands(id,code,slug,name) VALUES ('{brand}','FIXTURE','fixture','Fixture');
        INSERT INTO categories(id,code,slug,name) VALUES ('{category}','FIXTURE','fixture','Fixture');
        INSERT INTO products(id,brand_id,category_id,name,slug) VALUES ('{product}','{brand}','{category}','Fixture laptops','fixture');
        INSERT INTO variants(id,product_id,sku,name,price_vnd) VALUES ('{v1}','{product}','FIXTURE-A','Fixture A',1000000),('{v2}','{product}','FIXTURE-B','Fixture B',2000000);
        INSERT INTO stores(id,code,name) VALUES ('{a}','FIXTURE_STORE_A','Fixture Store A'),('{b}','FIXTURE_STORE_B','Fixture Store B');
        INSERT INTO inventory(store_id,variant_id,on_hand_qty,reserved_qty) VALUES ('{a}','{v1}',10,0),('{a}','{v2}',10,0),('{b}','{v1}',1,0),('{b}','{v2}',1,0);
        """)
        env.update({'ENABLE_POSTGRES': 'true', 'DB_USERNAME': 'retailmind_app_runtime', 'INTERNAL_TOOL_SECRET': secret, 'REDIS_HOST': 'redis', 'REDIS_PORT': '6379', 'MINIO_ENDPOINT': 'minio', 'MINIO_PORT': '9000', 'MINIO_ACCESS_KEY': settings.get('MINIO_ACCESS_KEY', ''), 'MINIO_SECRET_KEY': settings.get('MINIO_SECRET_KEY', '')})
        backend, core_url = start(tag + '-core', 'retailmind_ai-backend', env, 4000)
        ready(core_url + '/api/v1/catalog/products')
        frontend, web_url = start(tag + '-web', 'retailmind_ai-frontend', {'BACKEND_INTERNAL_URL': 'http://' + tag + '-core:4000', 'HOSTNAME': '0.0.0.0'}, 3000)
        ready(web_url)
        client = httpx.Client(base_url=web_url + '/api/proxy/', timeout=30)
        reg = client.post('auth/register', json={'email': 'checkout@example.invalid', 'password': 'FixtureTest!2026', 'fullName': 'Isolated Checkout Test', 'phone': '0900000000'})
        check('real_register', reg.status_code == 201)
        user = unpack(reg)['user']['id']
        token = reg.cookies.get('access_token')
        client.headers['Cookie'] = 'access_token=' + token
        def request(method, path, body=None, key=None):
            return client.request(method, path, json=body, headers={'Idempotency-Key': key} if key else None)
        check('bff_real_profile', request('GET', 'auth/me').status_code == 200)
        for sku in ('FIXTURE-A', 'FIXTURE-B'):
            check('cart_add_' + sku, request('POST', 'cart/items', {'sku': sku, 'quantity': 1, 'storeId': a}).status_code == 201)
        cart = unpack(request('GET', 'cart'))
        check('no_store_is_unknown_not_zero', all(i['availableStock'] is None and i['inStock'] is None for i in cart['items']))
        check('quantity_requires_store', request('PATCH', 'cart/items/FIXTURE-A', {'quantity': 2}).status_code == 400)
        updated = request('PATCH', 'cart/items/FIXTURE-A', {'quantity': 2, 'storeId': a})
        check('quantity_update_uses_real_store', updated.status_code == 200 and unpack(updated)['itemsCount'] == 3)
        check('other_store_stock_enforced', request('PATCH', 'cart/items/FIXTURE-A', {'quantity': 2, 'storeId': b}).status_code == 409)
        items = [{'sku': 'FIXTURE-A', 'quantity': 2}, {'sku': 'FIXTURE-B', 'quantity': 1}]
        preview = unpack(request('POST', 'orders/preview', {'storeId': a, 'items': items}))
        check('exact_preview_all_cart_items', preview['totalVnd'] == '4400000' and len(preview['items']) == 2)
        body = {'storeId': a, 'items': items, 'fromCart': True, 'paymentMethod': 'QR_NAPAS247', 'previewToken': preview['previewToken']}
        invalid = request('POST', 'orders/checkout', {**body, 'previewToken': 'invalid'}, str(uuid.uuid4()))
        check('invalid_preview_rolls_back', invalid.status_code == 400 and sql('SELECT count(*) FROM orders;') == '0' and len(unpack(request('GET', 'cart'))['items']) == 2)
        request('PATCH', 'cart/items/FIXTURE-A', {'quantity': 1, 'storeId': a})
        stale = request('POST', 'orders/checkout', body, str(uuid.uuid4()))
        check('changed_cart_blocks_stale_checkout', stale.status_code == 409 and sql('SELECT count(*) FROM orders;') == '0')
        request('PATCH', 'cart/items/FIXTURE-A', {'quantity': 2, 'storeId': a})
        key = str(uuid.uuid4())
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(lambda _: request('POST', 'orders/checkout', body, key), range(2)))
        check('concurrent_checkout_at_least_one_confirmed', any(r.status_code == 201 for r in responses), [r.status_code for r in responses])
        replay = request('POST', 'orders/checkout', body, key)
        check('checkout_replay', replay.status_code == 201)
        order = unpack(replay)
        order_id = order['orderId']
        check('one_order_two_items_and_exact_total', sql('SELECT count(*) FROM orders;') == '1' and sql('SELECT count(*) FROM order_items;') == '2' and order['totalVnd'] == '4400000')
        check('cart_cleared_in_checkout_commit', unpack(request('GET', 'cart'))['items'] == [])
        check('reserved_once', sql(f"SELECT reserved_qty FROM inventory WHERE store_id='{a}' AND variant_id='{v1}';") == '2')
        check('changed_payload_conflicts', request('POST', 'orders/checkout', {**body, 'items': [{'sku': 'FIXTURE-A', 'quantity': 1}]}, key).status_code == 409)
        receipt = unpack(request('GET', 'orders/' + order_id))
        check('receipt_from_core', receipt['status'] == 'placed' and len(receipt['items']) == 2 and receipt['storeName'] == 'Fixture Store A')
        other = httpx.post(web_url + '/api/proxy/auth/register', json={'email': 'other@example.invalid', 'password': 'FixtureTest!2026', 'fullName': 'Other Test', 'phone': '0900000001'})
        other_cookie = {'Cookie': 'access_token=' + other.cookies.get('access_token')}
        check('other_user_receipt_denied', httpx.get(web_url + '/api/proxy/orders/' + order_id, headers=other_cookie).status_code == 404)
        check('other_user_payment_denied', httpx.post(web_url + '/api/proxy/orders/' + order_id + '/simulate-payment', headers={**other_cookie, 'Idempotency-Key': str(uuid.uuid4())}).status_code == 403)
        check('payment_requires_operation_key', request('POST', f'orders/{order_id}/simulate-payment').status_code == 400)
        sql(f"UPDATE inventory SET reserved_qty=0 WHERE store_id='{a}' AND variant_id='{v1}';")
        payment_key = str(uuid.uuid4())
        check('payment_rejects_missing_reservation', request('POST', f'orders/{order_id}/simulate-payment', key=payment_key).status_code == 409)
        check('failed_payment_rolls_back', sql(f"SELECT status FROM orders WHERE id='{order_id}';") == 'placed' and sql(f"SELECT on_hand_qty FROM inventory WHERE store_id='{a}' AND variant_id='{v1}';") == '10')
        sql(f"UPDATE inventory SET reserved_qty=2 WHERE store_id='{a}' AND variant_id='{v1}';")
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            paid = list(pool.map(lambda _: request('POST', f'orders/{order_id}/simulate-payment', key=payment_key), range(2)))
        check('concurrent_payment_replays_same_receipt', all(r.status_code == 201 for r in paid) and unpack(paid[0]) == unpack(paid[1]))
        check('payment_debits_stock_once', sql(f"SELECT on_hand_qty||','||reserved_qty FROM inventory WHERE store_id='{a}' AND variant_id='{v1}';") == '8,0' and sql("SELECT count(*) FROM audit_events WHERE action='ORDER_PAYMENT';") == '1')
        check('receipt_confirms_completed_payment', unpack(request('GET', 'orders/' + order_id))['status'] == 'completed')
        check('new_payment_key_cannot_pay_twice', request('POST', f'orders/{order_id}/simulate-payment', key=str(uuid.uuid4())).status_code == 409)
        # Leave an unpurchased cart item intact when ordering directly.
        request('POST', 'cart/items', {'sku': 'FIXTURE-B', 'quantity': 1, 'storeId': a})
        direct = unpack(request('POST', 'orders/checkout', {'storeId': a, 'items': [{'sku': 'FIXTURE-A', 'quantity': 1}]}, str(uuid.uuid4())))
        check('buy_now_preserves_unpurchased_cart', len(unpack(request('GET', 'cart'))['items']) == 1)
        check('cancel_unpaid_order_restores_reservation', request('POST', 'orders/' + direct['orderId'] + '/cancel', {'reason': 'Fixture cleanup'}).status_code == 201 and sql(f"SELECT reserved_qty FROM inventory WHERE store_id='{a}' AND variant_id='{v1}';") == '0')
        # Real Core ticket with actual owned order/profile, followed by replay.
        ticket_headers = {'Authorization': 'Bearer ' + token, 'X-Internal-Secret': secret, 'Idempotency-Key': str(uuid.uuid4())}
        ticket_body = {'order_id': order_id, 'title': 'Fixture ticket', 'description': 'Isolated end-to-end support ticket test.'}
        t1 = httpx.post(core_url + '/api/v1/internal/tools/create_support_ticket', headers=ticket_headers, json=ticket_body)
        t2 = httpx.post(core_url + '/api/v1/internal/tools/create_support_ticket', headers=ticket_headers, json=ticket_body)
        check('owned_order_ticket_and_replay', t1.status_code == t2.status_code == 201 and unpack(t1)['ticket_id'] == unpack(t2)['ticket_id'] and sql('SELECT count(*) FROM support_tickets;') == '1')
        last_item = {'storeId': b, 'items': [{'sku': 'FIXTURE-B', 'quantity': 1}]}
        def compete(cookie):
            return httpx.post(web_url + '/api/proxy/orders/checkout', json=last_item,
                              headers={'Cookie': cookie, 'Idempotency-Key': str(uuid.uuid4())}, timeout=30)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            last_results = list(pool.map(compete, ['access_token=' + token, other_cookie['Cookie']]))
        check('last_item_two_customers_no_oversell', sorted(r.status_code for r in last_results) == [201, 409]
              and sql(f"SELECT reserved_qty FROM inventory WHERE store_id='{b}' AND variant_id='{v2}';") == '1')
        success = True
        manifest = {'fixture': tag, 'containers': containers, 'web_url': web_url, 'core_url': core_url, 'store': a, 'order': order['orderNo'], 'checks': checks}
        report.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps({'passed': len(checks), 'report': str(report), 'web_url': web_url if args.keep_running else None}), flush=True)
    finally:
        if not (success and args.keep_running):
            for container in reversed(containers):
                metadata = json.loads(docker('inspect', container))[0]
                if metadata['Config']['Labels'].get('retailmind.fixture') != tag:
                    raise RuntimeError('Fixture cleanup label mismatch')
                docker('stop', container)
        if not success:
            report.write_text(json.dumps({'fixture': tag, 'checks': checks, 'failed': True}, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()
