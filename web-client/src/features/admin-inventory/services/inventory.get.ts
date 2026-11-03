import { apiFetch } from '@/lib/api-client';
import { BranchInventoryRecord } from '../types';

export const INITIAL_BRANCH_INVENTORY: BranchInventoryRecord[] = [
  {
    id: 'inv-1',
    sku: 'LT-ASUS-VIVO15-OLED',
    name: 'Laptop Asus Vivobook 15 OLED A1505VA',
    branchCode: 'MWG_HCM_001',
    branchName: 'Thế Giới Di Động 136 Nguyễn Thái Học, Quận 1, TP.HCM',
    physicalQty: 15,
    reservedQty: 3,
    availableQty: 12,
    safetyThreshold: 5,
    lastUpdated: '2026-10-27 09:30',
  },
  {
    id: 'inv-2',
    sku: 'LT-ASUS-VIVO15-OLED',
    name: 'Laptop Asus Vivobook 15 OLED A1505VA',
    branchCode: 'MWG_HN_002',
    branchName: 'Thế Giới Di Động 117 Thái Hà, Đống Đa, Hà Nội',
    physicalQty: 10,
    reservedQty: 2,
    availableQty: 8,
    safetyThreshold: 5,
    lastUpdated: '2026-10-27 09:15',
  },
  {
    id: 'inv-3',
    sku: 'LT-DELL-INSP14-5430',
    name: 'Laptop Dell Inspiron 14 5430',
    branchCode: 'MWG_HCM_001',
    branchName: 'Thế Giới Di Động 136 Nguyễn Thái Học, Quận 1, TP.HCM',
    physicalQty: 10,
    reservedQty: 2,
    availableQty: 8,
    safetyThreshold: 4,
    lastUpdated: '2026-10-27 08:45',
  },
  {
    id: 'inv-4',
    sku: 'LT-LENOVO-TB14-G6',
    name: 'Laptop Lenovo ThinkBook 14 G6+ (2024)',
    branchCode: 'MWG_DN_003',
    branchName: 'Điện Máy Xanh 320 đường 2 Tháng 9, Hải Châu, Đà Nẵng',
    physicalQty: 3,
    reservedQty: 1,
    availableQty: 2,
    safetyThreshold: 3,
    lastUpdated: '2026-10-27 08:20',
  },
  {
    id: 'inv-5',
    sku: 'LT-ACER-SWIFT-GO14',
    name: 'Laptop Acer Swift Go 14 OLED SFG14',
    branchCode: 'MWG_DN_003',
    branchName: 'Điện Máy Xanh 320 đường 2 Tháng 9, Hải Châu, Đà Nẵng',
    physicalQty: 2,
    reservedQty: 2,
    availableQty: 0,
    safetyThreshold: 3,
    lastUpdated: '2026-10-27 08:00',
  },
];

/**
 * Tra cứu ma trận tồn kho chi nhánh trực tiếp từ PostgreSQL SSOT
 */
export async function getBranchInventoryMatrix(): Promise<BranchInventoryRecord[]> {
  try {
    const res = await apiFetch<any>('inventory/matrix', { retries: 1 });
    if (res.success && res.data) {
      const list = Array.isArray(res.data) ? res.data : (res.data as any)?.data || [];
      if (Array.isArray(list)) {
        return list.map((r: any) => ({
          id: r.id || `${r.storeId}-${r.variantId}`,
          sku: r.sku,
          name: r.name,
          branchCode: r.branchCode,
          branchName: r.branchName,
          physicalQty: Number(r.physicalQty),
          reservedQty: Number(r.reservedQty),
          availableQty: Number(r.availableQty),
          safetyThreshold: Number(r.safetyThreshold) || 5,
          lastUpdated: r.lastUpdated || new Date().toLocaleString('vi-VN'),
        }));
      }
    }
  } catch {
    // Fallback to baseline
  }

  throw new Error('Dữ liệu tồn kho hiện không khả dụng.');
}
