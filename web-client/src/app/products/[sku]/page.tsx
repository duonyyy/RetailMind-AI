'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { BrandSectionBackground } from '@/components/patterns';
import { getLaptopBySku } from '@/features/catalog/services/catalog.get';
import { LaptopProduct } from '@/features/catalog/types';
import { formatVND } from '@/lib/utils';
import { apiFetch } from '@/lib/api-client';
import { ScreenLoading } from '@/components/commons/ScreenLoading';
import { ScreenEmpty } from '@/components/commons/ScreenEmpty';
import {
  CheckCircle2,
  Building2,
  ShieldCheck,
  CreditCard,
  Scale,
  ArrowLeft,
  Cpu,
  HardDrive,
  Monitor,
  BatteryCharging,
  RefreshCw,
  ShoppingCart,
  AlertCircle,
  Laptop,
} from 'lucide-react';

export default function ProductDetailPage() {
  const router = useRouter();
  const params = useParams<{ sku?: string }>();
  const rawSku = params?.sku ? decodeURIComponent(params.sku).trim().toUpperCase() : '';

  const [product, setProduct] = useState<LaptopProduct | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCity, setSelectedCity] = useState<'ALL' | 'HCM' | 'HN' | 'DN'>('ALL');
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');

  const [isAddingCart, setIsAddingCart] = useState(false);
  const [cartFeedback, setCartFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);

    if (!rawSku) {
      setProduct(null);
      setIsLoading(false);
      return;
    }

    getLaptopBySku(rawSku)
      .then((live) => {
        if (!active) return;
        setProduct(live);
        if (live?.branches && live.branches.length > 0) {
          setSelectedStoreId(live.branches[0].storeId);
        }
        setIsLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setProduct(null);
        setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [rawSku]);

  const handleAddToCart = async () => {
    if (!product || isAddingCart) return;
    setIsAddingCart(true);
    setCartFeedback(null);
    try {
      const res = await apiFetch<any>('cart/items', {
        method: 'POST',
        body: JSON.stringify({
          sku: product.sku,
          quantity: 1,
          storeId: selectedStoreId || undefined,
        }),
        retries: 0,
      });

      if (!res.success) {
        if (res.error?.code === 'HTTP_401' || res.error?.code === 'UNAUTHORIZED') {
          setCartFeedback({
            text: 'Vui lòng đăng nhập tài khoản khách hàng để thêm sản phẩm vào giỏ hàng.',
            type: 'error',
          });
          return;
        }
        throw new Error(res.error?.message || 'Không thể thêm vào giỏ hàng.');
      }

      setCartFeedback({
        text: `Đã thêm "${product.name}" vào giỏ hàng thành công!`,
        type: 'success',
      });
    } catch (err) {
      setCartFeedback({
        text: err instanceof Error ? err.message : 'Lỗi khi thêm vào giỏ hàng.',
        type: 'error',
      });
    } finally {
      setIsAddingCart(false);
    }
  };

  if (isLoading) {
    return (
      <BrandSectionBackground
        variant="soft-blue"
        pattern="dot"
        patternOpacity={0.05}
        withGlow={true}
        className="min-h-full p-6 sm:p-12"
      >
        <div className="max-w-2xl mx-auto py-12">
          <ScreenLoading message="Đang tải thông số kỹ thuật và tình trạng tồn kho..." />
        </div>
      </BrandSectionBackground>
    );
  }

  if (!product) {
    return (
      <BrandSectionBackground
        variant="soft-blue"
        pattern="dot"
        patternOpacity={0.05}
        withGlow={true}
        className="min-h-full p-6 sm:p-12"
      >
        <div className="max-w-xl mx-auto py-8">
          <ScreenEmpty
            title="Không tìm thấy sản phẩm"
            description={`Mã sản phẩm "${rawSku || 'N/A'}" không tồn tại hoặc đã ngừng kinh doanh trên hệ thống RetailMind.`}
            actionText="Quay lại danh mục Laptop"
            onAction={() => router.push('/catalog')}
          />
        </div>
      </BrandSectionBackground>
    );
  }

  const visibleBranches = product.branches.filter(
    (b) => selectedCity === 'ALL' || b.city === selectedCity
  );

  return (
    <BrandSectionBackground
      variant="soft-blue"
      pattern="dot"
      patternOpacity={0.05}
      withGlow={true}
      className="min-h-full p-4 sm:p-8 space-y-6"
    >
      {/* Breadcrumbs */}
      <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <Link
            href="/catalog"
            className="inline-flex items-center gap-1 font-bold text-blue-600 hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Danh mục Laptop</span>
          </Link>
          <span>/</span>
          <span>{product.brand}</span>
          <span>/</span>
          <span className="font-semibold text-slate-900 truncate max-w-xs">{product.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="ts-badge-success px-2.5 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>Sản phẩm chính hãng MWG</span>
          </span>
        </div>
      </div>

      {cartFeedback && (
        <div
          role="alert"
          className={`p-4 rounded-xl border text-xs font-semibold flex items-center justify-between gap-3 ${
            cartFeedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {cartFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{cartFeedback.text}</span>
          </div>
          {cartFeedback.type === 'success' ? (
            <Link
              href="/cart"
              className="underline font-bold text-emerald-900 hover:text-emerald-950 shrink-0"
            >
              Xem giỏ hàng →
            </Link>
          ) : (
            <Link
              href="/login?redirect=/catalog"
              className="underline font-bold text-rose-900 hover:text-rose-950 shrink-0"
            >
              Đăng nhập ngay →
            </Link>
          )}
        </div>
      )}

      {/* Main 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Product Visual & Technical Specs */}
        <div className="lg:col-span-6 space-y-6">
          {/* Product Showcase Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="relative h-64 w-full rounded-2xl bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col items-center justify-center p-6 text-white overflow-hidden shadow-inner">
              <Laptop className="w-24 h-24 text-blue-300/80 mb-2 drop-shadow-md" />
              <span className="font-extrabold text-base tracking-wide text-center max-w-sm">
                {product.name}
              </span>
              <span className="text-xs text-blue-200/80 mt-1">
                {product.displaySpec} • {product.brand}
              </span>
              <span className="absolute bottom-3 right-3 bg-white/10 backdrop-blur-md text-white text-[10px] font-mono px-2.5 py-0.5 rounded-md border border-white/20">
                SKU: {product.sku}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2.5 text-center text-xs">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Vi xử lý</span>
                <span className="font-bold text-slate-800 truncate block mt-0.5">
                  {product.cpuModel}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Bộ nhớ RAM</span>
                <span className="font-bold text-blue-600 block mt-0.5">
                  {product.ramGb ? `${product.ramGb} GB` : 'Chưa có thông tin'}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Ổ cứng</span>
                <span className="font-bold text-slate-800 block mt-0.5 truncate">
                  {product.storageType || 'Chưa có thông tin'}
                </span>
              </div>
            </div>
          </div>

          {/* Full Technical Spec Table */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-blue-600" />
              <span>Bảng Thông Số Kỹ Thuật Chi Tiết</span>
            </h2>

            <div className="divide-y divide-slate-100 text-xs">
              <div className="py-2.5 flex justify-between gap-4">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-slate-400" /> Vi xử lý (CPU):
                </span>
                <span className="font-bold text-slate-900 text-right">{product.cpuModel || 'Chưa có thông tin'}</span>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-slate-400" /> Bộ nhớ RAM:
                </span>
                <span className="font-bold text-blue-600 text-right">{product.ramType || (product.ramGb ? `${product.ramGb} GB` : 'Chưa có thông tin')}</span>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <span className="text-slate-500">Ổ cứng lưu trữ:</span>
                <span className="font-semibold text-slate-800 text-right">{product.storageType || 'Chưa có thông tin'}</span>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <span className="text-slate-500">Card đồ họa (GPU):</span>
                <span className="font-semibold text-slate-800 text-right">{product.gpuModel || 'Chưa có thông tin'}</span>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <Monitor className="w-3.5 h-3.5 text-slate-400" /> Màn hình &amp; Độ phủ màu:
                </span>
                <span className="font-semibold text-slate-800 text-right">
                  {product.displaySpec || 'Chưa có thông tin'} {product.colorGamut ? `(${product.colorGamut})` : ''}
                </span>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <BatteryCharging className="w-3.5 h-3.5 text-slate-400" /> Thời lượng pin &amp; Trọng lượng:
                </span>
                <span className="font-semibold text-slate-800 text-right">
                  {product.batteryHours ? `Pin: ${product.batteryHours} giờ` : 'Thời lượng pin đang cập nhật'} • {product.weightKg || 'Chưa có thông tin'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Price, Branch Stock & Actions */}
        <div className="lg:col-span-6 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold px-2.5 py-0.5 rounded-md">
                  {product.brand}
                </span>
                <span className="text-xs text-slate-500">{product.category}</span>
              </div>
              <h1 className="text-xl font-extrabold text-slate-900">{product.name}</h1>
              <p className="text-xs font-mono text-slate-400 mt-0.5">Mã SKU: {product.sku}</p>
            </div>

            {/* Price Box */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50/90 via-cyan-50/60 to-blue-50/90 border border-blue-200/80 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700 block">
                  Giá Niêm Yết Chính Hãng
                </span>
                <div className="flex items-baseline gap-3 mt-1">
                  <span className="text-2xl font-extrabold text-blue-600 tabular-nums">
                    {product.formattedPrice || formatVND(product.priceVnd)}
                  </span>
                  {product.originalPriceVnd && (
                    <span className="text-xs text-slate-400 line-through tabular-nums">
                      {formatVND(product.originalPriceVnd)}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <span className="inline-block bg-emerald-600 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg">
                  Voucher: MWG_VIP500 (-500K)
                </span>
              </div>
            </div>

            {/* Branch Stock Availability Matrix */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                  <Building2 className="w-4 h-4 text-blue-600" />
                  <span>Tồn Kho Theo Chi Nhánh Siêu Thị:</span>
                </div>
                <div className="flex items-center gap-1 text-[11px] font-semibold">
                  {(['ALL', 'HCM', 'HN', 'DN'] as const).map((city) => (
                    <button
                      key={city}
                      type="button"
                      onClick={() => setSelectedCity(city)}
                      className={`px-2 py-0.5 rounded-md transition ${
                        selectedCity === city
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {city === 'ALL' ? 'Toàn quốc' : city}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                {visibleBranches.length === 0 ? (
                  <p className="text-xs text-slate-500 py-3 text-center">
                    Chưa có dữ liệu tồn kho tại khu vực này.
                  </p>
                ) : (
                  visibleBranches.map((br) => (
                    <button
                      key={br.storeId}
                      type="button"
                      onClick={() => setSelectedStoreId(br.storeId)}
                      className={`w-full p-3 rounded-xl border text-left text-xs flex items-center justify-between transition ${
                        selectedStoreId === br.storeId
                          ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20'
                          : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                      }`}
                    >
                      <div>
                        <div className="font-bold text-slate-900">{br.name}</div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          Mã kho: {br.branchCode} • Đang giữ chỗ: {br.reservedQty} máy
                        </div>
                      </div>
                      <span className="ts-badge-success px-2.5 py-1 rounded-full font-bold text-[11px] tabular-nums">
                        ✓ Sẵn sàng: {br.availableQty} máy
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Highlights */}
            {product.highlights && product.highlights.length > 0 && (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Đặc điểm nổi bật &amp; Chính sách bảo hành:</span>
                </div>
                <ul className="space-y-1.5">
                  {product.highlights.map((h, i) => (
                    <li key={i} className="text-xs text-slate-600 flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* CTA Buttons */}
            <div className="space-y-3 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={isAddingCart}
                  onClick={handleAddToCart}
                  className="py-3 px-4 rounded-xl border border-blue-600 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition disabled:opacity-50"
                >
                  {isAddingCart ? (
                    <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                  ) : (
                    <ShoppingCart className="w-4 h-4 text-blue-600" />
                  )}
                  <span>Thêm Vào Giỏ Hàng</span>
                </button>

                <Link
                  href={`/checkout?sku=${encodeURIComponent(product.sku)}${
                    selectedStoreId ? `&store=${encodeURIComponent(selectedStoreId)}` : ''
                  }`}
                  className="ts-cta py-3 px-4 text-xs font-bold flex items-center justify-center gap-2"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Mua Ngay</span>
                </Link>
              </div>

              <div className="text-center">
                <Link
                  href={`/compare?skus=${encodeURIComponent(product.sku)}`}
                  className="text-xs font-semibold text-slate-500 hover:text-blue-600 transition inline-flex items-center gap-1.5"
                >
                  <Scale className="w-3.5 h-3.5 text-blue-600" />
                  <span>Mở bảng so sánh sản phẩm này</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </BrandSectionBackground>
  );
}
