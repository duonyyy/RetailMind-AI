'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { BrandSectionBackground } from '@/components/patterns';
import {
  getLaptopBySku,
  BASELINE_LAPTOP_CATALOG,
} from '@/features/catalog/services/catalog.get';
import { LaptopProduct } from '@/features/catalog/types';
import { formatVND } from '@/lib/utils';
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
  Database,
} from 'lucide-react';

export default function ProductDetailPage() {
  const params = useParams<{ sku: string }>();
  const rawSku = decodeURIComponent(params?.sku || 'LT-ASUS-VIVO15-OLED').toUpperCase();

  const [product, setProduct] = useState<LaptopProduct>(() => {
    return (
      BASELINE_LAPTOP_CATALOG.find((p) => p.sku.toUpperCase() === rawSku) ||
      BASELINE_LAPTOP_CATALOG[0]
    );
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    getLaptopBySku(rawSku).then((live) => {
      if (!active) return;
      if (live) setProduct(live);
      setIsLoading(false);
    }).catch(() => {
      if (!active) return;
      setIsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [rawSku]);

  const [selectedCity, setSelectedCity] = useState<'ALL' | 'HCM' | 'HN' | 'DN'>('ALL');
  const [selectedStoreId, setSelectedStoreId] = useState(
    product.branches[0]?.storeId || '10000000-0000-0000-0000-000000000001'
  );
  const [activeAngle, setActiveAngle] = useState(0);

  useEffect(() => {
    if (product.branches && product.branches.length > 0) {
      setSelectedStoreId(product.branches[0].storeId);
    }
  }, [product]);

  const visibleBranches = product.branches.filter(
    (b) => selectedCity === 'ALL' || b.city === selectedCity
  );

  const angles = [
    { label: 'Góc Chính Diện 3D', img: '/brand/illustrations/hero-exam-orbit-3d.png' },
    { label: 'Màn Hình & Bàn Phím', img: '/brand/illustrations/focus-exam-room-3d.png' },
    { label: 'Cổng Kết Nối & Tản Nhiệt', img: '/brand/illustrations/grading-analytics-3d.png' },
  ];

  return (
    <BrandSectionBackground
      variant="soft-blue"
      pattern="dot"
      patternOpacity={0.05}
      withGlow={true}
      className="min-h-full p-6 sm:p-8 space-y-6"
    >
      {/* Breadcrumbs */}
      <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <Link href="/catalog" className="inline-flex items-center gap-1 font-bold text-blue-600 hover:underline">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Danh mục Laptop</span>
          </Link>
          <span>/</span>
          <span>{product.brand}</span>
          <span>/</span>
          <span className="font-semibold text-slate-900">{product.name}</span>
        </div>
        <div className="flex items-center gap-2">
          {isLoading && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-blue-600">
              <RefreshCw className="w-3 h-3 animate-spin" />
              <span>Đồng bộ tồn kho...</span>
            </span>
          )}
          <span className="ts-badge-success px-2.5 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1">
            <Database className="w-3 h-3" />
            <span>SCR-04 • Chi Tiết Sản Phẩm &amp; Tồn Kho Chi Nhánh (PDP)</span>
          </span>
        </div>
      </div>

      {/* Main PDP 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: 3D Gallery & Technical Specs Accordion */}
        <div className="lg:col-span-6 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="relative h-64 w-full rounded-xl bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center overflow-hidden border border-slate-200">
              <Image
                src={angles[activeAngle].img}
                alt={product.name}
                width={260}
                height={220}
                className="object-contain drop-shadow-xl transition-transform duration-300 hover:scale-105"
              />
              <span className="absolute top-3 left-3 bg-white/15 backdrop-blur-md text-white text-[11px] font-bold px-3 py-1 rounded-full border border-white/20">
                {angles[activeAngle].label}
              </span>
              <span className="absolute bottom-3 right-3 bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[11px] font-mono px-2.5 py-0.5 rounded-md">
                SKU: {product.sku}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              {angles.map((ang, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActiveAngle(idx)}
                  className={`p-2.5 rounded-xl border text-xs font-semibold transition ${
                    activeAngle === idx
                      ? 'border-blue-600 bg-blue-50/70 text-blue-700'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {ang.label}
                </button>
              ))}
            </div>
          </div>

          {/* Full Technical Spec Table */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-blue-600" />
              <span>Bảng Thông Số Kỹ Thuật Toàn Diện (PostgreSQL SSOT)</span>
            </h2>

            <div className="divide-y divide-slate-100 text-xs">
              <div className="py-2.5 flex justify-between gap-4">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-slate-400" /> Vi xử lý (CPU):
                </span>
                <span className="font-bold text-slate-900 text-right">{product.cpuModel}</span>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-slate-400" /> Bộ nhớ RAM:
                </span>
                <span className="font-bold text-blue-600 text-right">{product.ramType}</span>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <span className="text-slate-500">Ổ cứng lưu trữ:</span>
                <span className="font-semibold text-slate-800 text-right">{product.storageType}</span>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <span className="text-slate-500">Card đồ họa (GPU):</span>
                <span className="font-semibold text-slate-800 text-right">{product.gpuModel}</span>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <Monitor className="w-3.5 h-3.5 text-slate-400" /> Màn hình &amp; Độ phủ màu:
                </span>
                <span className="font-semibold text-slate-800 text-right">
                  {product.displaySpec} ({product.colorGamut})
                </span>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <BatteryCharging className="w-3.5 h-3.5 text-slate-400" /> Thời lượng pin &amp; Trọng lượng:
                </span>
                <span className="font-semibold text-slate-800 text-right">
                  Lên tới {product.batteryHours} giờ • {product.weightKg}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: SSOT Price, Voucher, Branch Stock Matrix & CTA */}
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
              <p className="text-xs font-mono text-slate-400 mt-0.5">Mã SKU chuẩn: {product.sku}</p>
            </div>

            {/* SSOT Price Box */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50/90 via-cyan-50/60 to-blue-50/90 border border-blue-200/80 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700 block">
                  Giá Niêm Yết Chính Thức (PostgreSQL SSOT)
                </span>
                <div className="flex items-baseline gap-3 mt-1">
                  <span className="text-2xl font-extrabold text-blue-600 tabular-nums">
                    {product.formattedPrice}
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
                  <span>Bản Đồ Tồn Kho Chi Nhánh Siêu Thị (Real-time):</span>
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
                {visibleBranches.map((br) => (
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
                ))}
              </div>
            </div>

            {/* Highlights & Policy Guarantee */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
              <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Đặc điểm nổi bật &amp; Cam kết Bảo hành MWG:</span>
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

            {/* CTA Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <Link
                href={`/checkout?sku=${product.sku}&store=${selectedStoreId}`}
                className="sm:col-span-2 ts-cta py-3 text-xs font-bold flex items-center justify-center gap-2"
              >
                <CreditCard className="w-4 h-4" />
                <span>MUA NGAY (Khóa Tồn Kho 10 Phút)</span>
              </Link>
              <Link
                href={`/compare?skus=${product.sku},LT-LENOVO-TB14-G6`}
                className="py-3 px-4 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-bold flex items-center justify-center gap-1.5 transition"
              >
                <Scale className="w-4 h-4 text-blue-600" />
                <span>So Sánh Máy</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </BrandSectionBackground>
  );
}
