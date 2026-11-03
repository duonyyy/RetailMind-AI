import { adjustBranchStockAction } from './services/inventory.action';
import { apiFetch } from '@/lib/api-client';
jest.mock('@/lib/api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('next/headers', () => ({ cookies: () => ({ get: () => ({ value: 'fixture-token' }) }) }));
const request = apiFetch as jest.Mock;
const input = { branchCode: 'STORE', sku: 'ABC', newPhysicalQty: 5, deltaQty: 1, reason: 'Fixture', initiatedBy: 'admin' };
test('backend rejection cannot be reported as an inventory update', async () => {
 request.mockResolvedValue({ success: false, data: null });
 await expect(adjustBranchStockAction(input)).rejects.toThrow();
 expect(request).toHaveBeenCalledWith('inventory/adjust', expect.objectContaining({ headers: { Authorization: 'Bearer fixture-token' } }));
});
test('confirmed result returns Core data without a fabricated audit hash', async () => {
 request.mockResolvedValue({ success: true, data: { onHandQty: 5 } });
 const result = await adjustBranchStockAction(input);
 expect(result.data).toEqual({ onHandQty: 5 });
 expect(result).not.toHaveProperty('auditHash');
});
