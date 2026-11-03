'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BrandSectionBackground } from '@/components/patterns';
import { apiFetch } from '@/lib/api-client';
import { formatVND } from '@/lib/utils';
import { ScreenEmpty } from '@/components/commons/ScreenEmpty';
import { ScreenError } from '@/components/commons/ScreenError';
import { ScreenLoading } from '@/components/commons/ScreenLoading';
import { useCurrentUser } from '@/features/auth/useCurrentUser';
import {
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  ShoppingBag,
  LogIn,
  Store,
} from 'lucide-react';

interface CartItem {
  sku: string;
  name: string;
  quantity: number;
  unitPriceVnd: string;
  lineTotalVnd: string;
}

interface CartData {
  items: CartItem[];
  totalVnd: string;
}

export default function CartPage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useCurrentUser();
  const [cart, setCart] = useState<CartData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUnauthorized, setIsUnauthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [busyItemSku, setBusyItemSku] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [stores, setStores] = useState<Array<{ id: string; name: string }>>([]);
  const [storeId, setStoreId] = useState('');

  useEffect(() => {
    let active = true;
    apiFetch<Array<{ id: string; name: string }>>('inventory/stores').then(result => {
      if (!active) return;
      if (result.success && Array.isArray(result.data)) setStores(result.data);
      else setError('Không thể tải cửa hàng. Vui lòng thử lại.');
    });
    return () => { active = false; };
  }, []);

  const loadCart = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setIsUnauthorized(false);
    try {
      const result = await apiFetch<CartData>(`cart${storeId ? `?storeId=${encodeURIComponent(storeId)}` : ''}`, { retries: 0 });
      if (!result.success) {
        if (result.error?.code === 'HTTP_401' || result.error?.code === 'UNAUTHORIZED') {
          setIsUnauthorized(true);
          setCart(null);
          return;
        }
        throw new Error(result.error?.message || 'Không thể tải thông tin giỏ hàng.');
      }
      if (!result.data || !Array.isArray(result.data.items)) {
        throw new Error('Dữ liệu giỏ hàng nhận được không đúng cấu trúc.');
      }
      setCart(result.data);
    } catch (e) {
      setCart(null);
      setError(e instanceof Error ? e.message : 'Lỗi kết nối khi tải giỏ hàng.');
    } finally {
      setIsLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    if (!isAuthLoading) {
      if (!user) {
        setIsUnauthorized(true);
        setIsLoading(false);
      } else {
        loadCart();
      }
    }
  }, [user, isAuthLoading, loadCart]);

  const handleUpdateQuantity = async (sku: string, newQty: number) => {
    if (busyItemSku || isClearing || newQty < 1) return;
    if (!storeId) { setError('Vui lòng chọn cửa hàng trước khi đổi số lượng.'); return; }
    setBusyItemSku(sku);
    setError(null);
    try {
      const result = await apiFetch<CartData>(`cart/items/${encodeURIComponent(sku)}`, {
        method: 'PATCH',
        body: JSON.stringify({ quantity: newQty, storeId }),
        retries: 0,
      });
      if (!result.success || !result.data || !Array.isArray(result.data.items)) {
        throw new Error(result.error?.message || 'Chưa xác nhận cập nhật số lượng giỏ hàng.');
      }
      setCart(result.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể cập nhật số lượng sản phẩm.');
    } finally {
      setBusyItemSku(null);
    }
  };

  const handleRemoveItem = async (sku: string) => {
    if (busyItemSku || isClearing) return;
    setBusyItemSku(sku);
    setError(null);
    try {
      const result = await apiFetch<CartData>(`cart/items/${encodeURIComponent(sku)}${storeId ? `?storeId=${encodeURIComponent(storeId)}` : ''}`, {
        method: 'DELETE',
        retries: 0,
      });
      if (!result.success || !result.data || !Array.isArray(result.data.items)) {
        throw new Error(result.error?.message || 'Chưa xác nhận xóa sản phẩm khỏi giỏ hàng.');
      }
      setCart(result.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể xóa sản phẩm khỏi giỏ hàng.');
    } finally {
      setBusyItemSku(null);
    }
  };

  const handleClearCart = async () => {
    if (busyItemSku || isClearing) return;
    if (!confirm('Bạn có chắc chắn muốn xóa toàn bộ sản phẩm trong giỏ hàng?')) return;
    setIsClearing(true);
    setError(null);
    try {
      const result = await apiFetch<{ message: string }>('cart', {
        method: 'DELETE',
        retries: 0,
      });
      if (!result.success) {
        throw new Error(result.error?.message || 'Không thể làm trống giỏ hàng.');
      }
      setCart({ items: [], totalVnd: '0' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi khi xóa giỏ hàng.');
    } finally {
      setIsClearing(false);
    }
  };

  const checkoutHref = `/checkout?source=cart&store=${encodeURIComponent(storeId)}`;

  return (
    <BrandSectionBackground
      variant="soft-blue"
      pattern="dot"
      patternOpacity={0.05}
      withGlow={true}
      className="min-h-full p-4 sm:p-8 space-y-6"
    >
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-1">
              <Link href="/catalog" className="hover:text-blue-600 transition">
                Danh mục laptop
              </Link>
              <span>/</span>
              <span className="text-slate-800">Giỏ hàng của tôi</span>
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
              <ShoppingCart className="w-6 h-6 text-blue-600" />
              <span>Giỏ Hàng Mua Sắm</span>
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadCart}
              disabled={isLoading || isAuthLoading}
              className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 inline-flex items-center gap-1.5 shadow-xs transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Tải lại</span>
            </button>
            <Link
              href="/catalog"
              className="px-3.5 py-2 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 text-xs font-bold inline-flex items-center gap-1.5 transition"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Xem thêm laptop</span>
            </Link>
          </div>
        </div>

        <label className="block text-sm font-semibold text-slate-700">
          Cửa hàng kiểm tra tồn kho và nhận hàng
          <select aria-label="Cửa hàng giỏ hàng" value={storeId} onChange={e => setStoreId(e.target.value)} disabled={!!busyItemSku || isClearing}
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3">
            <option value="">Chọn cửa hàng</option>
            {stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}
          </select>
        </label>
        {/* Global Error Banner */}
        {error && (
          <div role="alert" className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-800 flex items-center justify-between gap-2">
            <span>{error}</span>
            <button
              type="button"
              onClick={loadCart}
              className="underline font-bold text-rose-900 hover:text-rose-950 shrink-0"
            >
              Tải lại
            </button>
          </div>
        )}

        {/* Unauthorized State */}
        {!isAuthLoading && isUnauthorized && (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-4 shadow-xs">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center mx-auto">
              <LogIn className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-bold text-slate-900">Vui lòng đăng nhập tài khoản</h2>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Để bảo vệ quyền riêng tư và đồng bộ giỏ hàng, bạn cần đăng nhập tài khoản khách hàng trước khi xem hoặc quản lý giỏ hàng.
              </p>
            </div>
            <Link
              href="/login?redirect=/cart"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-5 py-2.5 shadow-xs transition"
            >
              <LogIn className="w-4 h-4" />
              <span>Đăng nhập ngay</span>
            </Link>
          </div>
        )}

        {/* Loading State */}
        {(isLoading || isAuthLoading) && !isUnauthorized && (
          <ScreenLoading message="Đang đồng bộ giỏ hàng của bạn..." />
        )}

        {/* Empty State */}
        {!isLoading && !isAuthLoading && !isUnauthorized && cart && cart.items.length === 0 && (
          <ScreenEmpty
            title="Giỏ hàng hiện đang trống"
            description="Bạn chưa chọn sản phẩm nào vào giỏ hàng. Hãy khám phá danh mục laptop chính hãng để chọn thiết bị phù hợp."
            actionText="Khám phá danh mục Laptop"
            onAction={() => router.push('/catalog')}
          />
        )}

        {/* Populated Cart Content */}
        {!isLoading && !isUnauthorized && cart && cart.items.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 8 Cols: Items List */}
            <div className="lg:col-span-8 space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs divide-y divide-slate-100 overflow-hidden">
                <div className="p-4 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between text-xs font-bold text-slate-600">
                  <span>Sản phẩm ({cart.items.length})</span>
                  <button
                    type="button"
                    onClick={handleClearCart}
                    disabled={isClearing || !!busyItemSku}
                    className="text-slate-400 hover:text-rose-600 transition inline-flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Xóa toàn bộ giỏ hàng</span>
                  </button>
                </div>

                {cart.items.map((item) => {
                  const isBusy = busyItemSku === item.sku;
                  return (
                    <div
                      key={item.sku}
                      className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition hover:bg-slate-50/50"
                    >
                      <div className="space-y-1 flex-1 min-w-0">
                        <Link
                          href={`/products/${encodeURIComponent(item.sku)}`}
                          className="font-bold text-sm text-slate-900 hover:text-blue-600 transition block truncate"
                        >
                          {item.name}
                        </Link>
                        <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                          <span>SKU: {item.sku}</span>
                        </div>
                        <div className="text-xs font-bold text-blue-600 tabular-nums pt-1">
                          {formatVND(item.unitPriceVnd)}
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-5 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                        {/* Quantity Spinner */}
                        <div className="flex items-center border border-slate-200 rounded-xl bg-slate-50 p-1">
                          <button
                            type="button"
                            disabled={isBusy || isClearing || item.quantity <= 1}
                            onClick={() => handleUpdateQuantity(item.sku, item.quantity - 1)}
                            aria-label={`Giảm số lượng ${item.name}`}
                            className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white transition"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-10 text-center font-bold text-xs text-slate-900 tabular-nums">
                            {isBusy ? <RefreshCw className="w-3.5 h-3.5 animate-spin mx-auto text-blue-600" /> : item.quantity}
                          </span>
                          <button
                            type="button"
                            disabled={isBusy || isClearing}
                            onClick={() => handleUpdateQuantity(item.sku, item.quantity + 1)}
                            aria-label={`Tăng số lượng ${item.name}`}
                            className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white transition"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Total per Item */}
                        <div className="text-right min-w-[100px]">
                          <span className="text-[10px] text-slate-400 block font-semibold">Tạm tính</span>
                          <span className="font-extrabold text-sm text-slate-900 tabular-nums">
                            {formatVND(item.lineTotalVnd)}
                          </span>
                        </div>

                        {/* Remove Action */}
                        <button
                          type="button"
                          disabled={isBusy || isClearing}
                          onClick={() => handleRemoveItem(item.sku)}
                          aria-label={`Xóa ${item.name} khỏi giỏ hàng`}
                          className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-40 transition"
                          title="Xóa sản phẩm"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Guarantees */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200 text-xs text-slate-600 flex flex-wrap items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Chính sách bảo hành cần được xác nhận riêng theo sản phẩm.</span>
                </div>
                <div className="flex items-center gap-2">
                  <Store className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>Sẵn sàng giữ tồn kho nhận tại siêu thị</span>
                </div>
              </div>
            </div>

            {/* Right 4 Cols: Order Summary */}
            <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
              <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
                Tổng Kết Giỏ Hàng
              </h2>

              <div className="space-y-3 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Số lượng sản phẩm:</span>
                  <span className="font-bold text-slate-900 tabular-nums">
                    {cart.items.reduce((sum, item) => sum + item.quantity, 0)} máy
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Hình thức nhận hàng:</span>
                  <span className="font-semibold text-slate-800">Tại siêu thị hoặc giao tận nơi</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Phí giao hàng:</span>
                  <span className="font-semibold text-emerald-600">Miễn phí</span>
                </div>
                <div className="pt-3 border-t border-slate-100 flex justify-between items-baseline">
                  <span className="text-sm font-bold text-slate-900">Tổng thanh toán:</span>
                  <span className="text-xl font-extrabold text-blue-600 tabular-nums">
                    {formatVND(cart.totalVnd)}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Giá đã bao gồm thuế VAT. Giá niêm yết và tồn kho sẽ được xác thực chính thức khi tiến hành đặt hàng.
                </p>
              </div>

              <div className="space-y-2 pt-2">
                <Link
                  href={checkoutHref}
                  className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition"
                >
                  <span>Tiến Hành Đặt Hàng</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/catalog"
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold text-xs flex items-center justify-center transition"
                >
                  Chọn Thêm Sản Phẩm Khác
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </BrandSectionBackground>
  );
}
