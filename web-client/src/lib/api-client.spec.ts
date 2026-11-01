import { apiFetch } from './api-client';

describe('Enterprise API Client (ADR-009 Section 2.3)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('should propagate trace headers and unwrap enveloped responses', async () => {
    const mockPayload = { items: [{ sku: 'LT-ASUS-VIVO15', name: 'Asus Vivobook' }], total: 1 };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: mockPayload,
        meta: { request_id: 'test-trace-id', timestamp: new Date().toISOString() },
      }),
    });

    const res = await apiFetch<typeof mockPayload>('catalog/products', {
      traceId: 'trace-test-1234',
    });

    expect(res.success).toBe(true);
    expect(res.data).toBeDefined();
    expect(res.data?.items[0].sku).toBe('LT-ASUS-VIVO15');

    // Test defensive .data property fallback
    expect((res.data as any)?.data).toBeDefined();

    // Verify headers passed to fetch
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const calledHeaders = (global.fetch as jest.Mock).mock.calls[0][1].headers;
    expect(calledHeaders.get('x-trace-id')).toBe('trace-test-1234');
  });

  it('should handle HTTP error responses gracefully', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Sản phẩm không tồn tại.' },
      }),
    });

    const res = await apiFetch('catalog/products/INVALID_SKU', { retries: 0 });

    expect(res.success).toBe(false);
    expect(res.data).toBeNull();
    expect(res.error?.code).toBe('NOT_FOUND');
    expect(res.error?.message).toBe('Sản phẩm không tồn tại.');
  });
});

