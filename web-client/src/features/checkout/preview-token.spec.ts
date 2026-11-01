import {
  calculateExactOrderPreview,
  fetchLiveOrderPreview,
} from './services/preview-token.get';

describe('Exact BigInt Order Preview & Signed Preview Token (SCR-08)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('should calculate exact order preview with 10% VAT without floating-point error', () => {
    const items = [
      {
        sku: 'LT-ASUS-VIVO15-OLED',
        name: 'Asus Vivobook 15 OLED',
        unitPriceVnd: '17990000',
        quantity: 1,
        stockMax: 10,
      },
    ];

    const preview = calculateExactOrderPreview(items);

    expect(preview.subtotalVnd).toBe('17990000');
    // Discount is 0 when no code
    expect(preview.discountVnd).toBe('0');
    // VAT 10% of 17990000 = 1799000
    expect(preview.vatVnd).toBe('1799000');
    // Grand total = 17990000 + 1799000 = 19789000
    expect(preview.grandTotalVnd).toBe('19789000');
    expect(preview.previewToken).toBeDefined();
    expect(preview.ttlSeconds).toBe(600);
  });

  it('should apply MWG_VIP500 voucher accurately when order >= 15M VND', () => {
    const items = [
      {
        sku: 'LT-ASUS-VIVO15-OLED',
        name: 'Asus Vivobook 15 OLED',
        unitPriceVnd: '17990000',
        quantity: 1,
        stockMax: 10,
      },
    ];

    const preview = calculateExactOrderPreview(items, 'MWG_VIP500');

    expect(preview.subtotalVnd).toBe('17990000');
    expect(preview.discountVnd).toBe('500000');
    // after discount = 17490000
    // VAT 10% = 1749000
    expect(preview.vatVnd).toBe('1749000');
    // Grand total = 17490000 + 1749000 = 19239000
    expect(preview.grandTotalVnd).toBe('19239000');
    expect(preview.discountCodeApplied).toBe('MWG_VIP500');
  });

  it('should fetch signed preview token from Core API via fetchLiveOrderPreview', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          previewToken: 'sig-hmac-sha256-verified-token',
          expiresAt: new Date(Date.now() + 600000).toISOString(),
          subtotalVnd: '17990000',
          discountVnd: '500000',
          vatVnd: '1749000',
          totalVnd: '19239000',
          formattedTotal: '19.239.000 ₫',
          items: [{ sku: 'LT-ASUS-VIVO15-OLED', quantity: 1, name: 'Asus Vivobook' }],
        },
      }),
    });

    const livePreview = await fetchLiveOrderPreview({
      storeId: '10000000-0000-0000-0000-000000000001',
      items: [{ sku: 'LT-ASUS-VIVO15-OLED', quantity: 1 }],
      discountCode: 'MWG_VIP500',
    });

    expect(livePreview.previewToken).toBe('sig-hmac-sha256-verified-token');
    expect(livePreview.grandTotalVnd).toBe('19239000');
    expect(livePreview.discountVnd).toBe('500000');
  });
});

