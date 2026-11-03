"""Read-only live Gemini/Core checks for affordable-laptop intent handling."""
import json
from pathlib import Path

import httpx


def main():
    questions = [
        'bạn có laptop nào giá rẻ không',
        'có mẫu nào rẻ nhất không bạn',
        'mình muốn laptop bình dân',
        'tìm laptop dưới 10 triệu',
        'tìm laptop dưới 18 triệu',
    ]
    results = []
    with httpx.Client(timeout=90) as client:
        catalog = client.get('http://localhost:4000/api/v1/catalog/products').json()['data']['items']
        if not catalog:
            raise RuntimeError('This live check requires a nonempty Core catalog.')
        cheapest = min(catalog, key=lambda product: int(product['priceVnd']))
        for index, query in enumerate(questions):
            response = client.post('http://localhost:3000/api/proxy/chat/stream', json={'query': query})
            events = [json.loads(line[6:]) for line in response.text.splitlines()
                      if line.startswith('data: ') and line[6:] != '[DONE]']
            answer = next((event for event in events if event.get('type') == 'answer'), {})
            content = answer.get('content', '')
            passed = response.status_code == 200 and answer.get('status') == 'done' and 'data: [DONE]' in response.text
            if index < 3:
                passed = passed and cheapest['sku'] in content and 'Bạn dự định chi' in content
            else:
                budget = 10000000 if index == 3 else 18000000
                matching = [product for product in catalog if int(product['priceVnd']) <= budget]
                passed = passed and all(product['sku'] not in content for product in catalog if int(product['priceVnd']) > budget)
                passed = passed and (any(product['sku'] in content for product in matching) if matching else 'chưa tìm thấy' in content.lower())
            results.append({'query': query, 'passed': bool(passed), 'answer': answer})
            print(json.dumps(results[-1], ensure_ascii=False), flush=True)
    target = Path('.test-rag-work/cheap-live-final.json')
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"Passed {sum(item['passed'] for item in results)}/{len(results)}")
    return 0 if all(item['passed'] for item in results) else 1


if __name__ == '__main__':
    raise SystemExit(main())
