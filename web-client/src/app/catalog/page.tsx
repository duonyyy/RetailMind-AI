'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { BrandSectionBackground } from '@/components/patterns';
import {
  getLaptopCatalog,

} from '@/features/catalog/services/catalog.get';
import { LaptopProduct } from '@/features/catalog/types';
import { ScreenEmpty } from '@/components/commons/ScreenEmpty';
import { formatVND } from '@/lib/utils';
import {
  CheckCircle2,
  Search,
  ShoppingCart,
  Scale,
  SlidersHorizontal,
  ExternalLink,
  Database,
  RefreshCw,
} from 'lucide-react';

export default function CatalogPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('ALL');
  const [selectedUseCase, setSelectedUseCase] = useState('ALL');
  const [minRam, setMinRam] = useState<number>(0);
  const [maxPriceVnd, setMaxPriceVnd] = useState<number>(40000000);
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [compareSkus, setCompareSkus] = useState<string[]>([]);

  const [products, setProducts] = useState<LaptopProduct[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLiveConnected, setIsLiveConnected] = useState(false);

  useEffect(() => {
    let active = true;
    setIsLoading(true);

    getLaptopCatalog({
      search: searchTerm,
      brand: selectedBrand,
      useCase: selectedUseCase,
      minRam: minRam || undefined,
      maxPrice: String(maxPriceVnd),
      onlyInStock,
    }).then((items) => {
      if (!active) return;
      setProducts(items);
      setIsLiveConnected(true);
      setIsLoading(false);
    }).catch(() => {
      if (!active) return;
      setProducts([]); setIsLiveConnected(false);
      setIsLoading(false);
    });

    return () => {
      active = false;
    };
  }, [searchTerm, selectedBrand, selectedUseCase, minRam, maxPriceVnd, onlyInStock]);

  const toggleCompare = (sku: string) => {
    setCompareSkus((prev) =>
      prev.includes(sku)
        ? prev.filter((s) => s !== sku)
        : prev.length < 4
        ? [...prev, sku]
        : prev
    );
  };

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
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Danh Mục Laptop Chính Hãng
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Lọc đa chiều theo ngân sách VNĐ, RAM, nhu cầu sử dụng và kiểm tra tồn kho khả dụng tại từng siêu thị MWG.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href={`/compare?skus=${compareSkus.join(',')}`}
            className="px-3.5 py-2 rounded-xl bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition"
          >
            <Scale className="w-3.5 h-3.5" />
            <span>So Sánh Đối Đầu ({compareSkus.length}/4)</span>
          </Link>
          <Link
            href="/cart"
            className="ts-cta text-xs py-2 px-3.5 inline-flex items-center gap-1.5"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>Giỏ Hàng</span>
          </Link>
        </div>
      </div>

      {/* Live SSOT Status Pill */}
      <div
        role="status"
        className="rounded-xl border border-blue-200 bg-blue-50/80 px-4 py-2.5 text-xs text-blue-900 flex items-center justify-between"
      >
        <div className="flex items-center gap-2 font-medium">
          <Database className="w-4 h-4 text-blue-600 shrink-0" />
          <span>
            {isLiveConnected
              ? 'Dữ liệu kết nối thời gian thực. Tồn kho khả dụng và giá niêm yết chính xác theo từng chi nhánh siêu thị.'
              : 'Đang đồng bộ danh mục sản phẩm...'}
          </span>
        </div>
        {isLoading && (
          <span className="flex items-center gap-1 text-[11px] font-bold text-blue-600">
            <RefreshCw className="w-3 h-3 animate-spin" />
            <span>Đang tải...</span>
          </span>
        )}
      </div>

      {/* Multi-Faceted Filter Bar (SCR-03 Spec) */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold text-slate-700 mr-1 flex items-center gap-1">
              <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600" /> Hãng:
            </span>
            {['ALL', 'ASUS', 'DELL', 'LENOVO', 'ACER', 'HP', 'APPLE'].map((b) => (
              <button
                key={b}
                onClick={() => setSelectedBrand(b)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  selectedBrand === b
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                }`}
              >
                {b}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm tên máy, SKU, CPU (Core Ultra, M2)..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-4 gap-4 text-xs items-center">
          {/* Price Range Slider */}
          <div>
            <div className="flex justify-between font-semibold text-slate-700 mb-1">
              <span>Trần giá tối đa:</span>
              <span className="text-blue-600 font-bold tabular-nums">{formatVND(maxPriceVnd)}</span>
            </div>
            <input
              type="range"
              min={15000000}
              max={40000000}
              step={1000000}
              value={maxPriceVnd}
              onChange={(e) => setMaxPriceVnd(Number(e.target.value))}
              className="w-full accent-blue-600 cursor-pointer"
            />
          </div>

          {/* RAM Filter */}
          <div>
            <span className="font-semibold text-slate-700 block mb-1">Dung lượng RAM tối thiểu:</span>
            <div className="flex items-center gap-1.5">
              {[0, 8, 16, 32].map((ram) => (
                <button
                  key={ram}
                  onClick={() => setMinRam(ram)}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                    minRam === ram
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {ram === 0 ? 'Tất cả' : `≥ ${ram}GB`}
                </button>
              ))}
            </div>
          </div>

          {/* Use Case Filter */}
          <div>
            <span className="font-semibold text-slate-700 block mb-1">Nhu cầu sử dụng:</span>
            <select
              value={selectedUseCase}
              onChange={(e) => setSelectedUseCase(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800"
            >
              <option value="ALL">Tất cả phân khúc</option>
              <option value="OFFICE">Học tập - Văn phòng</option>
              <option value="CREATOR">Đồ họa - Kỹ thuật AI</option>
              <option value="GAMING">Gaming - Đồ họa nặng</option>
              <option value="PREMIUM">Mỏng nhẹ Cao cấp</option>
            </select>
          </div>

          {/* In-stock Toggle */}
          <div className="flex items-center md:justify-end">
            <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={onlyInStock}
                onChange={(e) => setOnlyInStock(e.target.checked)}
                className="rounded text-blue-600"
              />
              <span>Chỉ hiện máy sẵn hàng tại chi nhánh</span>
            </label>
          </div>
        </div>
      </div>

      {!isLoading && products.length === 0 && (
        <ScreenEmpty
          title="Không tìm thấy laptop phù hợp"
          description="Không có sản phẩm nào thỏa mãn các tiêu chí lọc hiện tại. Vui lòng thay đổi khoảng giá, dung lượng RAM hoặc từ khóa tìm kiếm."
          actionText="Đặt lại bộ lọc"
          onAction={() => {
            setSearchTerm('');
            setSelectedBrand('ALL');
            setSelectedUseCase('ALL');
            setMinRam(0);
            setMaxPriceVnd(40000000);
            setOnlyInStock(false);
          }}
        />
      )}

      {/* Grid of Laptops */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {products.map((item) => {
          const isCompared = compareSkus.includes(item.sku);
          return (
            <div
              key={item.sku}
              className="ts-feature-card p-6 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="bg-blue-50 text-blue-700 border border-blue-200 text-xs px-2.5 py-0.5 rounded-md font-bold">
                      {item.brand}
                    </span>
                    <span className="text-[11px] text-slate-500 font-medium">
                      {item.category}
                    </span>
                  </div>
                  <span className="ts-badge-success text-xs px-2.5 py-0.5 rounded-md font-bold flex items-center gap-1 tabular-nums">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Kiểm tra tồn kho tại trang sản phẩm
                  </span>
                </div>

                <Link
                  href={`/products/${item.sku}`}
                  className="text-base font-bold text-slate-900 hover:text-blue-600 transition inline-flex items-center gap-1.5 mb-1"
                >
                  <span>{item.name}</span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                </Link>
                <p className="text-xs font-mono text-slate-400 mb-4">SKU: {item.sku}</p>

                {/* Hardware specifications */}
                <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200/80 mb-4">
                  <div>
                    <span className="text-slate-400 block">Vi xử lý (CPU):</span>
                    <span className="font-semibold text-slate-800">{item.cpuModel}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Bộ nhớ RAM:</span>
                    <span className="font-bold text-blue-600">{item.ramGb} GB</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Ổ cứng:</span>
                    <span className="font-medium text-slate-700">{item.storageType}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Màn hình:</span>
                    <span className="font-medium text-slate-700">{item.displaySpec}</span>
                  </div>
                </div>

                {/* Branch stock distribution */}
                <div className="mb-4">
                  <span className="text-[11px] font-bold text-slate-500 block mb-1.5">
                    Tồn kho khả dụng thực tế tại chi nhánh:
                  </span>
                  <div className="space-y-1">
                    {item.branches.map((br) => (
                      <div
                        key={br.storeId}
                        className="flex items-center justify-between text-xs py-1 px-2.5 rounded-lg bg-slate-100/70"
                      >
                        <span className="text-slate-600 truncate max-w-[270px]">{br.name}</span>
                        <span className="font-bold text-emerald-700 tabular-nums">
                          Còn {br.availableQty} máy
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">
                    Giá niêm yết
                  </span>
                  <span className="text-lg font-extrabold text-blue-600 tabular-nums">
                    {item.formattedPrice}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleCompare(item.sku)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border transition ${
                      isCompared
                        ? 'bg-blue-50 text-blue-700 border-blue-300'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {isCompared ? '✓ Đang so sánh' : '+ So sánh'}
                  </button>
                  <Link
                    href={`/products/${item.sku}`}
                    className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition"
                  >
                    Xem chi tiết
                  </Link>
                  <Link
                    href={`/checkout?sku=${item.sku}`}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition shadow-xs"
                  >
                    Đặt Mua
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </BrandSectionBackground>
  );
}
