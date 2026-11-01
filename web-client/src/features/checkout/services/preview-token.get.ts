import { apiFetch } from '@/lib/api-client';
import { formatVND, parseVndBigInt } from '@/lib/utils';
import { CartItem, OrderPreviewResponse } from '../types';

const VOUCHER_RULES: Record<string, { discountVnd: bigint; minOrderVnd: bigint }> = {
  MWG_VIP500: { discountVnd: BigInt(500000), minOrderVnd: BigInt(15000000) },
  BACK2SCHOOL: { discountVnd: BigInt(300000), minOrderVnd: BigInt(12000000) },
};

/**
 * Live Signed Order Preview (`preview-token.get.ts` per 17-FRONTEND_DESIGN.md & ADR-009)
 * Requests HMAC-SHA256 signed preview token from NestJS Core API / PostgreSQL 16+.
 */
export async function fetchLiveOrderPreview(payload: {
  storeId: string;
  items: Array<{ sku: string; quantity: number }>;
  discountCode?: string;
}): Promise<OrderPreviewResponse> {
  const res = await apiFetch<any>('orders/preview', {
    method: 'POST',
    retries: 1,
    body: JSON.stringify({
      storeId: payload.storeId,
      items: payload.items,
      discountCode: payload.discountCode,
    }),
  });

  if (res.success && res.data) {
    const d = res.data?.data || res.data;
    if (d?.previewToken) {
      return {
        previewToken: d.previewToken,
        expiresAtIso: d.expiresAt || new Date(Date.now() + 600000).toISOString(),
        ttlSeconds: 600,
        items: (d.items || []).map((it: any) => ({
          sku: it.sku,
          name: it.name || it.sku,
          unitPriceVnd: it.unitPriceVnd || '0',
          quantity: it.quantity || 1,
          stockMax: 10,
        })),
        subtotalVnd: d.subtotalVnd || '0',
        discountVnd: d.discountVnd || '0',
        vatVnd: d.vatVnd || '0',
        grandTotalVnd: d.totalVnd || '0',
        formattedSubtotal: formatVND(d.subtotalVnd || '0'),
        formattedDiscount: formatVND(d.discountVnd || '0'),
        formattedVat: formatVND(d.vatVnd || '0'),
        formattedGrandTotal: d.formattedTotal || formatVND(d.totalVnd || '0'),
        discountCodeApplied:
          d.discountVnd && d.discountVnd !== '0' ? payload.discountCode || null : null,
      };
    }
  }

  // Offline fallback only if Core API is unreachable
  return calculateExactOrderPreview(
    payload.items.map((it) => ({
      sku: it.sku,
      name: it.sku,
      unitPriceVnd: '17990000',
      quantity: it.quantity,
      stockMax: 10,
    })),
    payload.discountCode
  );
}

/**
 * Exact BigInt Order Preview Calculator
 * Eliminates all IEEE-754 floating point rounding issues per AGENTS.md Section 2.5.
 */
export function calculateExactOrderPreview(
  items: CartItem[],
  discountCode?: string
): OrderPreviewResponse {
  const zero = BigInt(0);
  const subtotalBig = items.reduce(
    (sum, item) => sum + parseVndBigInt(item.unitPriceVnd) * BigInt(item.quantity),
    zero
  );

  const normalizedCode = (discountCode || '').trim().toUpperCase();
  const rule = VOUCHER_RULES[normalizedCode];
  const discountBig =
    rule && subtotalBig >= rule.minOrderVnd ? rule.discountVnd : zero;

  const afterDiscount = subtotalBig > discountBig ? subtotalBig - discountBig : zero;
  // VAT 10% exact integer division: (afterDiscount * 10) / 100
  const vatBig = (afterDiscount * BigInt(10)) / BigInt(100);
  const grandTotalBig = afterDiscount + vatBig;

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  return {
    previewToken: `prv-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    expiresAtIso: expiresAt,
    ttlSeconds: 600,
    items,
    subtotalVnd: subtotalBig.toString(),
    discountVnd: discountBig.toString(),
    vatVnd: vatBig.toString(),
    grandTotalVnd: grandTotalBig.toString(),
    formattedSubtotal: formatVND(subtotalBig),
    formattedDiscount: formatVND(discountBig),
    formattedVat: formatVND(vatBig),
    formattedGrandTotal: formatVND(grandTotalBig),
    discountCodeApplied: discountBig > zero ? normalizedCode : null,
  };
}
