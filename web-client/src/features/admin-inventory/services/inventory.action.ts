'use server';

import { StockAdjustmentRequest } from '../types';
import { apiFetch } from '@/lib/api-client';
import { cookies } from 'next/headers';

export async function adjustBranchStockAction(req: StockAdjustmentRequest) {
  const store = cookies();
  const token = store.get('retailmind_access_token')?.value || store.get('access_token')?.value;
  if (!token) throw new Error('Cần đăng nhập tài khoản quản trị.');
  try {
    const res = await apiFetch<any>('inventory/adjust', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        storeId: req.branchCode,
        variantId: req.sku,
        newOnHandQty: req.newPhysicalQty,
        reason: req.reason,
      }),
      retries: 0,
    });

    if (res.success && res.data) {
      const d = res.data?.data || res.data;
      return {
        success: true,
        timestamp: new Date().toISOString(),
        request: req,
        data: d,
      };
    }
  } catch {
    // Fallback if needed
  }

  throw new Error('Chưa xác nhận được kết quả cập nhật tồn kho. Hãy kiểm tra lại trước khi thực hiện tiếp.');
}
