import { getLaptopCatalog, getLaptopBySku, mapDtoToLaptopProduct } from './services/catalog.get';
import { fetchLiveOrderPreview } from '../checkout/services/preview-token.get';
import { apiFetch } from '@/lib/api-client';
jest.mock('@/lib/api-client', () => ({ apiFetch: jest.fn() }));
const request = apiFetch as jest.Mock;
beforeEach(() => request.mockReset());
test('an authoritative empty catalog remains empty', async () => {
 request.mockResolvedValue({ success: true, data: { items: [] } });
 expect(await getLaptopCatalog()).toEqual([]);
});
test('catalog outage never returns sample products', async () => {
 request.mockResolvedValue({ success: false, data: null });
 await expect(getLaptopCatalog()).rejects.toThrow();
 expect(await getLaptopBySku('MISSING')).toBeNull();
});
test('missing preview never fabricates price or signed token', async () => {
 request.mockResolvedValue({ success: false, data: null });
 await expect(fetchLiveOrderPreview({ storeId: 'store', items: [{ sku: 'ABC', quantity: 1 }] })).rejects.toThrow();
});
test('missing price or mismatched product cannot be displayed as a confirmed item', async () => {
 expect(() => mapDtoToLaptopProduct({ sku: 'ABC', name: 'A' })).toThrow();
 request.mockResolvedValue({ success: true, data: { sku: 'OTHER', name: 'B', priceVnd: '100' } });
 expect(await getLaptopBySku('ABC')).toBeNull();
});
