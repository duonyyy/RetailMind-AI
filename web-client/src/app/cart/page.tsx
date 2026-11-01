'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { BrandSectionBackground } from '@/components/patterns';
import { formatVND } from '@/lib/utils';
import {
  fetchLiveOrderPreview,
  calculateExactOrderPreview,
} from '@/features/checkout/services/preview-token.get';
import { BASELINE_LAPTOP_CATALOG } from '@/features/catalog/services/catalog.get';
import { OrderPreviewResponse } from '@/features/checkout/types';
import {
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  CreditCard,
  CheckCircle2,
  ShieldCheck,
  Tag,
  ArrowRight,
  Laptop,
  Database,
  RefreshCw,
} from 'lucide-react';

export default function CartPage() {
  const [items, setItems] = useState([
    {
      sku: 'LT-ASUS-VIVO15-OLED',
      name: 'Laptop Asus Vivobook 15 OLED A1505VA',
      unitPriceVnd: '17990000',
      quantity: 1,
      stockMax: 12,
    },
  ]);
  const [discountCode, setDiscountCode] = useState('MWG_VIP500');
  const [preview, setPreview] = useState<OrderPreviewResponse>(() =>
    calculateExactOrderPreview(items, discountCode)
  );
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let active = true;
    if (items.length === 0) return;

    setIsLoading(true);
    fetchLiveOrderPreview({
      storeId: '10000000-0000-0000-0000-000000000001',
      items: items.map((it) => ({ sku: it.sku, quantity: it.quantity })),
      discountCode,
    })
      .then((live) => {
        if (!active) return;
        setPreview(live);
        setIsLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setPreview(calculateExactOrderPreview(items, discountCode));
        setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [items, discountCode]);

  const handleUpdateQty = (sku: string, delta: number) => {
    setItems((prev) =>
      prev.map((it) =>
        it.sku === sku
          ? {
              ...it,
              quantity: Math.max(1, Math.min(it.stockMax, it.quantity + delta)),
            }
          : it
      )
    );
  };

  const handleRemoveItem = (sku: string) => {
    setItems((prev) => prev.filter((it) => it.sku !== sku));
  };

  const handleAddSample = (sku: string) => {
    const found = BASELINE_LAPTOP_CATALOG.find((l) => l.sku === sku);
    if (!found) return;
    setItems((prev) => {
      const exists = prev.find((i) => i.sku === sku);
      if (exists) {
        return prev.map((i) =>
          i.sku === sku ? { ...i, quantity: Math.min(i.stockMax, i.quantity + 1) } : i
        );
      }
      return [
        ...prev,
        {
          sku: found.sku,
          name: found.name,
          unitPriceVnd: found.priceVnd,
          quantity: 1,
          stockMax: found.totalAvailableStock,
        },
      ];
    });
  };

  return (
    <BrandSectionBackground
      variant="soft-blue"
      pattern="dot"
      patternOpacity={0.05}
      withGlow={true}
      className="min-h-full p-6 sm:p-8 space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-blue-600" />
            <span>Giỏ Hàng &amp; Tính Toán Số Học Chính Xác (SCR-07 • UC03)</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-blue-600" />
            <span>
              100% phép tính tiền tệ thực thi qua Core API / PostgreSQL 16+ SSOT, triệt tiêu hoàn toàn sai số dấu phẩy động.
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isLoading && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-blue-600">
              <RefreshCw className="w-3 h-3 animate-spin" />
              <span>Đang tính giá...</span>
            </span>
          )}
          <button
            type="button"
            onClick={() => handleAddSample('LT-LENOVO-TB14-G6')}
            className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 shadow-xs transition"
          >
            <Laptop className="w-3.5 h-3.5 text-blue-600" />
            <span>+ Thêm ThinkBook 14 G6+</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Cart Items */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <h2 className="text-sm font-bold text-slate-900 mb-4">
              Danh sách sản phẩm trong giỏ ({items.length})
            </h2>

            {items.length === 0 ? (
              <div className="py-10 text-center space-y-3">
                <p className="text-xs text-slate-500">Giỏ hàng của quý khách đang trống.</p>
                <Link href="/catalog" className="ts-cta text-xs py-2 px-4 inline-flex items-center gap-1.5">
                  <span>Khám phá danh mục Laptop</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {items.map((it) => (
                  <div key={it.sku} className="py-4 flex items-center justify-between gap-4">
                    <div>
                      <Link
                        href={`/products/${it.sku}`}
                        className="text-sm font-bold text-slate-900 hover:text-blue-600"
                      >
                        {it.name}
                      </Link>
                      <p className="text-xs text-slate-400 font-mono">
                        SKU: {it.sku} • Tồn tối đa tại kho: {it.stockMax} máy
                      </p>
                      <span className="text-sm font-extrabold text-blue-600 tabular-nums block mt-1">
                        {formatVND(it.unitPriceVnd)}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                        <button
                          type="button"
                          onClick={() => handleUpdateQty(it.sku, -1)}
                          className="p-1.5 hover:bg-slate-200 transition"
                          aria-label="Giảm số lượng"
                        >
                          <Minus className="w-3.5 h-3.5 text-slate-600" />
                        </button>
                        <span className="px-3 text-xs font-bold text-slate-900 tabular-nums">
                          {it.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleUpdateQty(it.sku, 1)}
                          className="p-1.5 hover:bg-slate-200 transition"
                          aria-label="Tăng số lượng"
                        >
                          <Plus className="w-3.5 h-3.5 text-slate-600" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveItem(it.sku)}
                        className="p-2 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition"
                        aria-label="Xóa khỏi giỏ"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Discount Voucher Input Box */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Tag className="w-4 h-4 text-blue-600" />
              <h3>Mã Ưu Đãi &amp; Khuyến Mãi SSOT (UC07)</h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={discountCode}
                onChange={(e) => setDiscountCode(e.target.value)}
                placeholder="Nhập mã giảm giá (VD: MWG_VIP500 hoặc BACK2SCHOOL)"
                className="flex-1 min-w-[220px] bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {['MWG_VIP500', 'BACK2SCHOOL'].map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setDiscountCode(code)}
                  className={`px-3 py-2 rounded-xl text-xs font-mono font-bold border transition ${
                    discountCode.toUpperCase() === code
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {code}
                </button>
              ))}
            </div>
            {preview.discountCodeApplied && (
              <div className="text-xs text-emerald-700 font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>
                  Đã áp dụng mã {preview.discountCodeApplied}: Giảm trực tiếp {preview.formattedDiscount}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Exact Decimal Breakdown */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
              Bảng Phân Tách Tiền Tệ Minh Bạch
            </h2>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Tạm tính ({items.reduce((a, b) => a + b.quantity, 0)} máy):</span>
                <span className="font-semibold text-slate-900 tabular-nums">
                  {preview.formattedSubtotal}
                </span>
              </div>
              <div className="flex justify-between text-emerald-700">
                <span>Chiết khấu ({preview.discountCodeApplied || 'Không'}):</span>
                <span className="font-bold tabular-nums">-{preview.formattedDiscount}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Thuế GTGT (VAT 10%):</span>
                <span className="font-semibold text-slate-900 tabular-nums">
                  +{preview.formattedVat}
                </span>
              </div>
              <div className="pt-3 border-t border-slate-200 flex justify-between text-sm font-bold">
                <span className="text-slate-900">Tổng thanh toán cuối:</span>
                <span className="text-blue-600 text-lg font-extrabold tabular-nums">
                  {preview.formattedGrandTotal}
                </span>
              </div>
            </div>

            <Link
              href={`/checkout?sku=${items[0]?.sku || 'LT-ASUS-VIVO15-OLED'}&qty=${
                items[0]?.quantity || 1
              }&voucher=${discountCode}`}
              className="ts-cta w-full py-3 text-xs font-bold flex items-center justify-center gap-2"
            >
              <CreditCard className="w-4 h-4" />
              <span>Tiến Hành Đặt Hàng &amp; Khóa Tồn Kho</span>
            </Link>

            <div className="flex items-center gap-2 text-[11px] text-slate-500 justify-center">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
              <span>Bảo vệ chống gửi đúp bởi Idempotency-Key</span>
            </div>
          </div>
        </div>
      </div>
    </BrandSectionBackground>
  );
}
