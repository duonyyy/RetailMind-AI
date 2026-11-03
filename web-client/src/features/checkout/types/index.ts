export interface CartItem {
  sku: string;
  name: string;
  unitPriceVnd: string; // NUMERIC(18,0) string
  quantity: number;
  stockMax: number;
}

export interface OrderPreviewResponse {
  previewToken: string;
  expiresAtIso: string;
  ttlSeconds: number;
  items: CartItem[];
  subtotalVnd: string;
  discountVnd: string;
  vatVnd: string;
  grandTotalVnd: string;
  formattedSubtotal: string;
  formattedDiscount: string;
  formattedVat: string;
  formattedGrandTotal: string;
  discountCodeApplied: string | null;
}

export interface ConfirmOrderPayload {
  fromCart?: boolean;
  storeId: string;
  items: Array<{ sku: string; quantity: number }>;
  discountCode?: string;
  deliveryMode: 'STORE_PICKUP' | 'HOME_DELIVERY';
  paymentMethod: 'COD' | 'QR_NAPAS247' | 'CARD';
  customerName: string;
  customerPhone: string;
  deliveryAddress?: string;
  previewToken?: string;
}

export interface ConfirmedOrderReceipt {
  orderNo: string;
  orderId: string;
  status: 'placed' | 'confirmed';
  storeId: string;
  storeName: string;
  deliveryMode: 'STORE_PICKUP' | 'HOME_DELIVERY';
  paymentMethod: string;
  totalVnd: string;
  formattedTotal: string;
  itemsCount: number;
  confirmedAt: string;
  idempotencyKey: string;
}

