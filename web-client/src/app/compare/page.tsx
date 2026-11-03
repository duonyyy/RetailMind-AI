'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { BrandSectionBackground } from '@/components/patterns';
import {
  getLaptopCatalog,
  getLaptopComparison,
} from '@/features/catalog/services/catalog.get';
import { LaptopProduct } from '@/features/catalog/types';
import { ScreenEmpty } from '@/components/commons/ScreenEmpty';
import { parseVndBigInt } from '@/lib/utils';
import {
  Scale,
  ShoppingCart,
  SlidersHorizontal,
  Award,
  Database,
  RefreshCw,
} from 'lucide-react';

export default function ComparePage() {
  const [selectedSkus, setSelectedSkus] = useState<string[]>([]);
  const [options, setOptions] = useState<LaptopProduct[]>([]);
  useEffect(() => {
    let active = true;
    getLaptopCatalog().then(items => { if (active) { setOptions(items); setSelectedSkus(items.slice(0, 2).map(item => item.sku)); } }).catch(() => { if (active) setOptions([]); });
    return () => { active = false; };
  }, []);
  const [onlyDifferences, setOnlyDifferences] = useState(false);
  const [comparedItems, setComparedItems] = useState<LaptopProduct[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    getLaptopComparison(selectedSkus).then((items) => {
      if (!active) return;
      if (items) {
        setComparedItems(items);
      }
      setIsLoading(false);
    }).catch(() => {
      if (!active) return;
      setComparedItems([]);
      setIsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [selectedSkus]);

  const minPriceBig = comparedItems.reduce(
    (min, it) => {
      const p = parseVndBigInt(it.priceVnd);
      return p < min ? p : min;
    },
    BigInt(999999999)
  );

  const toggleSku = (sku: string) => {
    setSelectedSkus((prev) => {
      if (prev.includes(sku)) {
        return prev.length > 2 ? prev.filter((s) => s !== sku) : prev;
      }
      return prev.length < 4 ? [...prev, sku] : prev;
    });
  };

  const rows = [
    {
      label: 'Vi xử lý (CPU)',
      diff: true,
      render: (it: LaptopProduct) => (
        <div className="space-y-1.5">
          <div className="font-bold text-slate-900">{it.cpuModel}</div>
          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
            <div
              className="bg-blue-600 h-full rounded-full"
              style={{ width: `${it.cpuScore}%` }}
            />
          </div>
          <span className="text-[10px] font-mono text-blue-700 font-bold tabular-nums">
            CPU Benchmark Score: {it.cpuScore}/100
          </span>
        </div>
      ),
    },
    {
      label: 'Bộ nhớ RAM & Bus',
      diff: true,
      render: (it: LaptopProduct) => (
        <div>
          <span className="font-bold text-blue-600">{it.ramGb} GB</span>
          <p className="text-[11px] text-slate-600 mt-0.5">{it.ramType}</p>
        </div>
      ),
    },
    {
      label: 'Card đồ họa (GPU)',
      diff: true,
      render: (it: LaptopProduct) => (
        <div className="space-y-1">
          <span className="font-semibold text-slate-800 block">{it.gpuModel}</span>
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-cyan-500 h-full rounded-full"
              style={{ width: `${it.gpuScore}%` }}
            />
          </div>
        </div>
      ),
    },
    {
      label: 'Màn hình & Tần số quét',
      diff: true,
      render: (it: LaptopProduct) => (
        <div>
          <div className="font-semibold text-slate-800">{it.displaySpec}</div>
          <span className="text-[11px] text-emerald-700 font-medium">
            {it.colorGamut} • {it.refreshRateHz}Hz
          </span>
        </div>
      ),
    },
    {
      label: 'Ổ cứng lưu trữ',
      diff: false,
      render: (it: LaptopProduct) => (
        <span className="font-medium text-slate-800">{it.storageType}</span>
      ),
    },
    {
      label: 'Thời lượng Pin & Trọng lượng',
      diff: true,
      render: (it: LaptopProduct) => (
        <div className="space-y-1">
          <div className="font-bold text-slate-800 tabular-nums">
            Pin ~{it.batteryHours} giờ • Nặng {it.weightKg}
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full"
              style={{ width: `${Math.min(100, it.batteryHours * 5.5)}%` }}
            />
          </div>
        </div>
      ),
    },
    {
      label: 'Chính sách Đổi trả & Bảo hành',
      diff: false,
      render: (it: LaptopProduct) => (
        <span className="text-emerald-700 font-semibold">
          {it.returnDays && it.warrantyMonths ? `Đổi trả ${it.returnDays} ngày • Bảo hành ${it.warrantyMonths} tháng` : 'Chính sách chưa được xác nhận'}
        </span>
      ),
    },
  ];

  const visibleRows = onlyDifferences ? rows.filter((r) => r.diff) : rows;

  return (
    <BrandSectionBackground
      variant="soft-blue"
      pattern="dot"
      patternOpacity={0.05}
      withGlow={true}
      className="min-h-full p-6 sm:p-8 space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Scale className="w-5 h-5 text-blue-600" />
            <span>So Sánh Chi Tiết Laptop Đối Đầu</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Đối chiếu trực diện hiệu năng CPU/GPU, độ phủ màu màn hình, trọng lượng và giá niêm yết chính hãng.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isLoading && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-blue-600">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Đang tải thông số...</span>
            </span>
          )}
          <label className="inline-flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 cursor-pointer shadow-xs">
            <input
              type="checkbox"
              checked={onlyDifferences}
              onChange={(e) => setOnlyDifferences(e.target.checked)}
              className="rounded text-blue-600"
            />
            <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600" />
            <span>Chỉ xem điểm khác biệt</span>
          </label>
        </div>
      </div>

      {/* Model Selector Pills */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-slate-600 mr-2 flex items-center gap-1.5">
          <Database className="w-3.5 h-3.5 text-blue-600" />
          <span>Chọn từ 2 đến 4 mẫu máy:</span>
        </span>
        {options.map((item) => {
          const active = selectedSkus.includes(item.sku);
          return (
            <button
              key={item.sku}
              type="button"
              onClick={() => toggleSku(item.sku)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                active
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {item.name}
            </button>
          );
        })}
      </div>

      {!isLoading && comparedItems.length === 0 && (
        <ScreenEmpty
          title="Chưa có sản phẩm nào để so sánh"
          description="Vui lòng chọn từ 2 đến 4 mẫu laptop từ danh sách phía trên để xem bảng đối chiếu thông số chi tiết."
        />
      )}

      {/* Comparison Matrix Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="py-4 px-5 w-48 text-slate-500 font-bold uppercase tracking-wider">
                  Tiêu Chí Đối Đầu
                </th>
                {comparedItems.map((it) => {
                  const isBestPrice = parseVndBigInt(it.priceVnd) === minPriceBig;
                  return (
                    <th key={it.sku} className="py-4 px-5 min-w-[220px] align-top">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded text-[10px] font-bold">
                          {it.brand}
                        </span>
                        {isBestPrice && (
                          <span className="ts-badge-success px-2 py-0.5 rounded-full text-[10px] font-extrabold inline-flex items-center gap-1">
                            <Award className="w-3 h-3" /> Giá Tốt Nhất
                          </span>
                        )}
                      </div>
                      <Link
                        href={`/products/${it.sku}`}
                        className="text-sm font-extrabold text-slate-900 hover:text-blue-600 block leading-snug"
                      >
                        {it.name}
                      </Link>
                      <div className="text-base font-extrabold text-blue-600 tabular-nums mt-2">
                        {it.formattedPrice}
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <Link
                          href={`/checkout?sku=${it.sku}`}
                          className="ts-cta py-1.5 px-3 text-[11px] font-bold inline-flex items-center gap-1"
                        >
                          <ShoppingCart className="w-3 h-3" />
                          <span>Đặt Mua</span>
                        </Link>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleRows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-slate-50/70 transition">
                  <td className="py-4 px-5 font-bold text-slate-700 bg-slate-50/40">
                    {row.label}
                  </td>
                  {comparedItems.map((it) => (
                    <td key={it.sku} className="py-4 px-5 align-top">
                      {row.render(it)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </BrandSectionBackground>
  );
}
