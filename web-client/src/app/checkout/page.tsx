'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BrandSectionBackground } from '@/components/patterns';
import { apiFetch } from '@/lib/api-client';
import { formatVND } from '@/lib/utils';
import { confirmOrderAction } from '@/features/checkout/services/order.action';
import { ConfirmedOrderReceipt } from '@/features/checkout/types';
import { SimulatedQRPaymentModal } from '@/features/checkout/components/SimulatedQRPaymentModal';
import { useCurrentUser } from '@/features/auth/useCurrentUser';

import {
  Building2,
  Truck,
  CreditCard,
  QrCode,
  Banknote,
  ShieldCheck,
  Lock,
  RefreshCw,
  Database,
} from 'lucide-react';

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useCurrentUser();

  const initialSku = searchParams.get('sku') || '';
  const fromCart = searchParams.get('source') === 'cart';
  const [cartItems, setCartItems] = useState<Array<{ sku: string; quantity: number; name: string }>>([]);
  const initialStore = searchParams.get('store') || '';
  const initialQty = parseInt(searchParams.get('qty') || '1', 10);
  const initialVoucher = searchParams.get('voucher') || '';

  const [selectedSku, setSelectedSku] = useState(initialSku);
  const [quantity, setQuantity] = useState(Number.isSafeInteger(initialQty) && initialQty > 0 ? initialQty : 1);
  const [deliveryMode, setDeliveryMode] = useState<'STORE_PICKUP' | 'HOME_DELIVERY'>('STORE_PICKUP');
  const [selectedStoreId, setSelectedStoreId] = useState(initialStore);
  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'QR_NAPAS247' | 'CARD'>('QR_NAPAS247');
  const [discountCode, setDiscountCode] = useState(initialVoucher);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  useEffect(() => {
    if (user?.fullName) setCustomerName(user.fullName);
    if (user?.phone) setCustomerPhone(user.phone);
  }, [user]);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const submitLock = useRef(false);
  const paymentKey = useRef<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // State quản lý Modal Quét Mã QR Thanh Toán Mô Phỏng
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [confirmedReceipt, setConfirmedReceipt] = useState<ConfirmedOrderReceipt | null>(null);

  const [products, setProducts] = useState<Array<{ sku: string; name: string; formattedPrice: string }>>([]);
  const [stores, setStores] = useState<Array<{ id: string; name: string }>>([]);
  const [preview, setPreview] = useState<{
    previewToken: string;
    subtotalVnd: string;
    discountVnd: string;
    vatVnd: string;
    totalVnd: string;
  } | null>(null);
  const checkoutItems = useMemo(() => fromCart
    ? cartItems.map(({ sku, quantity }) => ({ sku, quantity }))
    : selectedSku ? [{ sku: selectedSku, quantity }] : [], [fromCart, cartItems, selectedSku, quantity]);
  const itemsSignature = JSON.stringify(checkoutItems);

  useEffect(() => {
    if (!fromCart || !user?.id) return;
    let active = true;
    apiFetch<{ items: Array<{ sku: string; quantity: number; name: string }> }>('cart', { retries: 0 }).then(result => {
      if (!active) return;
      if (!result.success || !Array.isArray(result.data?.items)) { setCheckoutError('Không thể tải giỏ hàng.'); return; }
      setCartItems(result.data.items);
      if (!result.data.items.length) setCheckoutError('Giỏ hàng đang trống.');
    });
    return () => { active = false; };
  }, [fromCart, user?.id]);

  // 1. Tải danh mục laptop và cửa hàng trực tiếp từ PostgreSQL Core API
  useEffect(() => {
    let active = true;

    Promise.all([
      apiFetch<any>('catalog/products'),
      apiFetch<any>('inventory/stores'),
    ]).then(([catalog, locations]) => {
      if (!active) return;

      const productRaw =
        catalog.data?.items ||
        (Array.isArray(catalog.data) ? catalog.data : []) ||
        (catalog.data as any)?.data ||
        [];

      const storeRaw =
        (Array.isArray(locations.data) ? locations.data : []) ||
        (locations.data as any)?.data ||
        [];

      const loadedProducts: Array<{ sku: string; name: string; formattedPrice: string }> =
        Array.isArray(productRaw) && productRaw.length > 0
          ? productRaw.map((p: any) => ({
              sku: p.sku,
              name: p.name,
              formattedPrice: p.formattedPrice || formatVND(p.priceVnd || '0'),
            }))
          : [];

      const loadedStores: Array<{ id: string; name: string }> =
        Array.isArray(storeRaw) && storeRaw.length > 0
          ? storeRaw.map((s: any) => ({
              id: s.id,
              name: s.name,
            }))
          : [];

      setProducts(loadedProducts);
      setStores(loadedStores);

      if (!selectedSku) {
        const matchedSku = loadedProducts.find((p) => p.sku === initialSku)?.sku;
        setSelectedSku(matchedSku || loadedProducts[0]?.sku || '');
      }

      if (!selectedStoreId) {
        const matchedStore = loadedStores.find((s) => s.id === initialStore)?.id;
        setSelectedStoreId(matchedStore || loadedStores[0]?.id || '');
      }
    }).catch(() => {
      setProducts([]); setStores([]);
      setSelectedSku(''); setSelectedStoreId('');
      setCheckoutError('Không thể tải dữ liệu đặt hàng từ Core.');
    });

    return () => {
      active = false;
    };
  }, []);

  // 2. Lấy Signed Preview Token từ Core API POST /orders/preview
  useEffect(() => {
    let active = true;
    setPreview(null);
    if (!checkoutItems.length || !selectedStoreId || checkoutItems.some(item => !Number.isSafeInteger(item.quantity) || item.quantity < 1)) {
      return () => {
        active = false;
      };
    }

    apiFetch<any>('orders/preview', {
      method: 'POST',
      body: JSON.stringify({
        storeId: selectedStoreId,
        items: checkoutItems,
        discountCode,
      }),
      retries: 0,
    }).then((result) => {
      if (!active) return;
      const data = result.data?.data || result.data;
      if (!result.success || !data?.previewToken) {
        setCheckoutError(result.error?.message || 'Không thể lấy giá từ hệ thống.');
        return;
      }
      setCheckoutError(null);
      setPreview(data);
    }).catch((err) => {
      if (!active) return;
      setCheckoutError(err instanceof Error ? err.message : 'Lỗi lấy tính giá xem trước.');
    });

    return () => {
      active = false;
    };
  }, [itemsSignature, selectedStoreId, discountCode]);

  const handleConfirmOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitLock.current || !preview || !user?.id) return;
    submitLock.current = true;
    setIsSubmitting(true);
    setCheckoutError(null);

    try {
      const storageKey = 'retailmind.checkout.pending.' + (user?.id || 'guest');
      const intent = JSON.stringify({ storeId: selectedStoreId, items: checkoutItems, fromCart, discountCode, paymentMethod });
      const saved = localStorage.getItem(storageKey);
      const pending = saved ? JSON.parse(saved) : null;
      if (pending && pending.intent !== intent) throw new Error('Đơn trước chưa rõ kết quả. Hãy kiểm tra lịch sử đơn trước khi đổi yêu cầu.');
      const idempotencyKey = pending?.key || crypto.randomUUID();
      localStorage.setItem(storageKey, JSON.stringify({ key: idempotencyKey, intent }));
      const res = await confirmOrderAction(
        {
          storeId: selectedStoreId,
          items: checkoutItems,
          fromCart,
          discountCode,
          deliveryMode,
          paymentMethod,
          customerName,
          customerPhone,
          deliveryAddress,
          previewToken: preview.previewToken,
        },
        idempotencyKey
      );

      if (!res.success || !res.data) {
        throw new Error('Không nhận được biên nhận đơn hàng hợp lệ.');
      }

      const receipt = res.data;
      localStorage.removeItem(storageKey);

      if (paymentMethod !== 'COD') {
        setConfirmedReceipt(receipt);
        setQrModalOpen(true);
      } else {
        router.push(
          `/checkout/success?orderNo=${encodeURIComponent(receipt.orderNo)}&total=${encodeURIComponent(
            receipt.formattedTotal
          )}&store=${encodeURIComponent(receipt.storeId)}&idem=${encodeURIComponent(
            receipt.idempotencyKey
          )}&method=${encodeURIComponent(paymentMethod)}`
        );
      }
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : 'Không thể đặt hàng.');
    } finally {
      submitLock.current = false;
      setIsSubmitting(false);
    }
  };

  const handleQRPaymentSuccess = async () => {
    if (!confirmedReceipt) return;
    const keyName = `retailmind.payment.${user?.id}.${confirmedReceipt.orderId}`;
    paymentKey.current = paymentKey.current || localStorage.getItem(keyName) || crypto.randomUUID();
    localStorage.setItem(keyName, paymentKey.current);
    try {
      // Simulate payment transaction commit in Core API PostgreSQL SSOT
      const result = await apiFetch(`orders/${confirmedReceipt.orderId || confirmedReceipt.orderNo}/simulate-payment`, {
        method: 'POST',
        idempotencyKey: paymentKey.current,
        retries: 0,
      });
      if (!result.success || (result.data as any)?.status !== 'completed') throw new Error('Chưa xác nhận thanh toán mô phỏng.');
      localStorage.removeItem(keyName);
    } catch {
      setCheckoutError('Chưa xác nhận thanh toán mô phỏng. Vui lòng kiểm tra đơn hàng.');
      throw new Error('Chưa xác nhận thanh toán mô phỏng. Bạn có thể thử lại an toàn với cùng mã thao tác.');
    }

    setQrModalOpen(false);
    router.push(
      `/checkout/success?orderNo=${encodeURIComponent(confirmedReceipt.orderNo)}&total=${encodeURIComponent(
        confirmedReceipt.formattedTotal
      )}&store=${encodeURIComponent(confirmedReceipt.storeId)}&idem=${encodeURIComponent(
        confirmedReceipt.idempotencyKey
      )}&method=QR_NAPAS247&paid=true`
    );
  };

  const handleQRPaymentClose = () => {
    setQrModalOpen(false);
    if (confirmedReceipt) {
      router.push(
        `/checkout/success?orderNo=${encodeURIComponent(confirmedReceipt.orderNo)}&total=${encodeURIComponent(
          confirmedReceipt.formattedTotal
        )}&store=${encodeURIComponent(confirmedReceipt.storeId)}&idem=${encodeURIComponent(
          confirmedReceipt.idempotencyKey
        )}&method=QR_NAPAS247&paid=false`
      );
    }
  };

  return (
    <BrandSectionBackground
      variant="soft-blue"
      pattern="dot"
      patternOpacity={0.05}
      withGlow={true}
      className="min-h-full p-6 sm:p-8 space-y-6"
    >
      {checkoutError && (
        <div role="alert" className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
          {checkoutError}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Lock className="w-5 h-5 text-blue-600" />
            <span>Đặt Hàng &amp; Xác Nhận Giữ Chỗ Sản Phẩm</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-blue-600" />
            <span>Giá niêm yết chính hãng và tồn kho được giữ chỗ trực tiếp tại siêu thị MWG.</span>
          </p>
        </div>
      </div>

      <form onSubmit={handleConfirmOrder} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 8 Cols: 3-Step Checkout */}
        <div className="lg:col-span-8 space-y-6">
          {/* Step 1: Product & Delivery Mode */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
              Bước 1: Chọn Sản Phẩm &amp; Hình Thức Nhận Hàng
            </h2>

            {fromCart ? <div className="space-y-2 text-sm" aria-label="Sản phẩm thanh toán từ giỏ">
              {cartItems.map(item => <p key={item.sku}>{item.name} — số lượng {item.quantity}</p>)}
              {!cartItems.length && <p>Giỏ hàng đang trống hoặc chưa tải được.</p>}
            </div> : <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="sm:col-span-2">
                <label className="font-semibold text-slate-700 block mb-1">Mẫu Laptop:</label>
                <select
                  value={selectedSku}
                  onChange={(e) => {
                    setPreview(null);
                    setSelectedSku(e.target.value);
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-semibold"
                >
                  {products.map((l) => (
                    <option key={l.sku} value={l.sku}>
                      {l.name} — {l.formattedPrice}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Số lượng:</label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={quantity}
                  onChange={(e) => {
                    setPreview(null);
                    setQuantity(Math.max(1, Number(e.target.value)));
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-bold tabular-nums"
                />
              </div>
            </div>}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-2">
              <button
                type="button"
                onClick={() => setDeliveryMode('STORE_PICKUP')}
                className={`p-3.5 rounded-xl border text-left flex items-center gap-3 transition ${
                  deliveryMode === 'STORE_PICKUP'
                    ? 'border-blue-600 bg-blue-50/70 ring-2 ring-blue-500/20'
                    : 'border-slate-200 bg-slate-50'
                }`}
              >
                <Building2 className="w-5 h-5 text-blue-600 shrink-0" />
                <div>
                  <div className="font-bold text-slate-900">Nhận tại siêu thị MWG gần nhất</div>
                  <div className="text-[11px] text-slate-500">Tồn kho được kiểm tra khi xác nhận đơn</div>
                </div>
              </button>

              <button
                type="button"
                disabled
                className={`p-3.5 rounded-xl border text-left flex items-center gap-3 transition ${
                  deliveryMode === 'HOME_DELIVERY'
                    ? 'border-blue-600 bg-blue-50/70 ring-2 ring-blue-500/20'
                    : 'border-slate-200 bg-slate-50'
                }`}
              >
                <Truck className="w-5 h-5 text-blue-600 shrink-0" />
                <div>
                  <div className="font-bold text-slate-900">Giao hàng tận nơi</div>
                  <div className="text-[11px] text-slate-500">Chưa hỗ trợ trong phiên bản này</div>
                </div>
              </button>
            </div>

            {deliveryMode === 'STORE_PICKUP' ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                {stores.map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => {
                      if (st.id !== selectedStoreId) {
                        setPreview(null);
                        setSelectedStoreId(st.id);
                      }
                    }}
                    className={`p-3 rounded-xl border text-left text-xs transition ${
                      selectedStoreId === st.id
                        ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20'
                        : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                    }`}
                  >
                    <div className="font-bold text-slate-900">{st.name}</div>
                    <div className="text-[11px] text-emerald-700 font-bold mt-1 tabular-nums">
                      Khóa tồn kho khi xác nhận
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-2">
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Họ và tên người nhận"
                  required
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900"
                />
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Số điện thoại nhận hàng"
                  required
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900"
                />
                <input
                  type="text"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Địa chỉ giao hàng chi tiết"
                  required
                  className="sm:col-span-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900"
                />
              </div>
            )}
          </div>

          {/* Step 2: Payment Method */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
              Bước 2: Phương Thức Thanh Toán Mô Phỏng
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <button
                type="button"
                onClick={() => setPaymentMethod('QR_NAPAS247')}
                className={`p-3.5 rounded-xl border text-left space-y-1 transition ${
                  paymentMethod === 'QR_NAPAS247'
                    ? 'border-blue-600 bg-blue-50/70'
                    : 'border-slate-200 bg-slate-50'
                }`}
              >
                <QrCode className="w-4 h-4 text-blue-600" />
                <div className="font-bold text-slate-900">Thanh toán mô phỏng</div>
                <div className="text-[11px] text-slate-500">Tự động đối soát mã đơn tức thì</div>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('COD')}
                className={`p-3.5 rounded-xl border text-left space-y-1 transition ${
                  paymentMethod === 'COD'
                    ? 'border-blue-600 bg-blue-50/70'
                    : 'border-slate-200 bg-slate-50'
                }`}
              >
                <Banknote className="w-4 h-4 text-emerald-600" />
                <div className="font-bold text-slate-900">Thanh toán khi nhận máy (COD)</div>
                <div className="text-[11px] text-slate-500">Kiểm tra máy nguyên seal trước khi trả</div>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('CARD')}
                className={`p-3.5 rounded-xl border text-left space-y-1 transition ${
                  paymentMethod === 'CARD'
                    ? 'border-blue-600 bg-blue-50/70'
                    : 'border-slate-200 bg-slate-50'
                }`}
              >
                <CreditCard className="w-4 h-4 text-blue-600" />
                <div className="font-bold text-slate-900">Thẻ ATM / Visa / Mastercard</div>
                <div className="text-[11px] text-slate-500">Miễn phí cà thẻ tại quầy siêu thị</div>
              </button>
            </div>
          </div>
        </div>

        {/* Right 4 Cols: Step 3 Final Confirmation */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
              Bước 3: Xác Nhận Cuối &amp; Khóa Tồn Kho
            </h2>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Tạm tính ({checkoutItems.reduce((sum, item) => sum + item.quantity, 0)} máy):</span>
                <span className="font-bold text-slate-900 tabular-nums">
                  {preview ? formatVND(preview.subtotalVnd) : 'Đang tính...'}
                </span>
              </div>
              <div className="flex justify-between text-emerald-700">
                <span>Voucher ({discountCode}):</span>
                <span className="font-bold tabular-nums">
                  -{preview ? formatVND(preview.discountVnd) : '0 ₫'}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Thuế GTGT (VAT 10%):</span>
                <span className="font-bold text-slate-900 tabular-nums">
                  +{preview ? formatVND(preview.vatVnd) : 'Đang tính...'}
                </span>
              </div>
              <div className="pt-3 border-t border-slate-200 flex justify-between text-sm font-bold">
                <span className="text-slate-900">Tổng thanh toán:</span>
                <span className="text-blue-600 text-lg font-extrabold tabular-nums">
                  {preview ? formatVND(preview.totalVnd) : 'Đang tính...'}
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !preview}
              className="ts-cta w-full py-3.5 text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Đang giữ chỗ sản phẩm và tạo đơn hàng...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Xác Nhận Đặt Hàng</span>
                </>
              )}
            </button>

            <p className="text-[11px] text-slate-400 text-center">
              AI Agent tuyệt đối không tự ý chốt đơn. Chỉ thao tác bấm nút của Quý khách mới kích hoạt giao dịch.
            </p>
          </div>
        </div>
      </form>

      {/* Modal Quét Mã QR Thanh Toán Mô Phỏng */}
      {confirmedReceipt && (
        <SimulatedQRPaymentModal
          isOpen={qrModalOpen}
          orderNo={confirmedReceipt.orderNo}
          totalVnd={confirmedReceipt.totalVnd}
          formattedTotal={confirmedReceipt.formattedTotal}
          storeName={confirmedReceipt.storeName}
          onSuccess={handleQRPaymentSuccess}
          onClose={handleQRPaymentClose}
        />
      )}
    </BrandSectionBackground>
  );
}

export default function CheckoutPage() {
  return (
    <React.Suspense fallback={<div className="p-8 text-center text-xs text-slate-500">Đang khởi tạo cổng thanh toán & kiểm tra tồn kho...</div>}>
      <CheckoutContent />
    </React.Suspense>
  );
}
