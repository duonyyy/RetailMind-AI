'use client';

import React, { useState, useEffect } from 'react';
import { BrandSectionBackground } from '@/components/patterns';
import { apiFetch } from '@/lib/api-client';
import { formatVND } from '@/lib/utils';

import {
  Laptop,
  Plus,
  Search,
  CheckCircle2,
  Power,
  RefreshCw,
  Database,
  AlertCircle,
} from 'lucide-react';

interface AdminProductRow {
  id: string;
  sku: string;
  name: string;
  brand: string;
  category: string;
  priceVnd: string;
  formattedPrice: string;
  cpuModel: string;
  ramGb: number;
  storageGb: number;
  active: boolean;
}

export default function AdminProductsPimPage() {
  const [products, setProducts] = useState<AdminProductRow[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loadError, setLoadError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSku, setNewSku] = useState('');
  const [newName, setNewName] = useState('');
  const [newBrand, setNewBrand] = useState('ASUS');
  const [newPriceVnd, setNewPriceVnd] = useState('18990000');
  const [newCpu, setNewCpu] = useState('Intel Core Ultra 5 125H');
  const [newRam, setNewRam] = useState(16);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchProducts = async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const res = await apiFetch<any>('catalog/products', { retries: 1 });
      if (res.success && res.data) {
        const raw = res.data?.items || (Array.isArray(res.data) ? res.data : []);
        if (Array.isArray(raw)) {
          const mapped: AdminProductRow[] = raw.map((p: any) => ({
            id: p.id || p.sku,
            sku: p.sku,
            name: p.name,
            brand: p.brand || 'Chưa có thông tin',
            category: p.category || 'Chưa có thông tin',
            priceVnd: String(p.priceVnd || '0'),
            formattedPrice: p.formattedPrice || formatVND(p.priceVnd || '0'),
            cpuModel: p.cpuModel || 'Chưa có thông tin',
            ramGb: p.ramGb ? Number(p.ramGb) : 0,
            storageGb: p.storageGb ? Number(p.storageGb) : 0,
            active: p.isActive === true,
          }));
          setProducts(mapped);
          return;
        }
      }
    } catch {
      // Fallback
    } finally {
      setIsLoading(false);
    }

    setLoadError('Không thể tải dữ liệu từ Core. Vui lòng thử lại.');
    setProducts([]);
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleToggleActive = async (sku: string) => {
    try {
      const res = await apiFetch<any>(`catalog/products/${encodeURIComponent(sku)}/toggle`, { method: 'POST', retries: 0 });
      if (!res.success || typeof res.data?.isActive !== 'boolean') throw new Error('Core chưa xác nhận thay đổi.');
      setProducts(prev => prev.map(p => p.sku === sku ? { ...p, active: res.data!.isActive } : p));
    } catch { setMsg({ text: 'Chưa xác nhận thay đổi sản phẩm. Hãy tải lại để kiểm tra.', type: 'error' }); }

  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSku.trim() || !newName.trim()) return;
    const cleanPrice = newPriceVnd.replace(/\D/g, '') || '18990000';
    setIsSubmitting(true);
    setMsg(null);

    try {
      const res = await apiFetch<any>('catalog/products', {
        method: 'POST',
        body: JSON.stringify({
          sku: newSku.toUpperCase().trim(),
          name: newName.trim(),
          brand: newBrand,
          priceVnd: cleanPrice,
          cpuModel: newCpu,
          ramGb: newRam,
        }),
      });

      if (!res.success) {
        throw new Error(res.error?.message || 'Không thể tạo biến thể.');
      }

      setMsg({ text: `Đã lưu sản phẩm ${newSku} thành công vào PostgreSQL SSOT!`, type: 'success' });
      setShowAddModal(false);
      setNewSku('');
      setNewName('');
      await fetchProducts();
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : 'Lỗi khi lưu sản phẩm.', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const filtered = products.filter(
    (p) =>
      !searchTerm ||
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <BrandSectionBackground
      variant="soft-blue"
      pattern="dot"
      patternOpacity={0.05}
      withGlow={true}
      className="min-h-full p-6 sm:p-8 space-y-6"
    >
      {loadError && <p role="alert" className="text-red-700">{loadError}</p>}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Laptop className="w-5 h-5 text-blue-600" />
            <span>Quản Lý Sản Phẩm &amp; Biến Thể SKU — PIM Hub (SCR-15 • UC02)</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-blue-600" />
            <span>
              Quản trị danh mục sản phẩm, cấu hình phần cứng và giá niêm yết kiểu NUMERIC(18,0) duy nhất tại PostgreSQL SSOT.
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchProducts()}
            disabled={isLoading}
            className="px-3 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-bold inline-flex items-center gap-1.5 shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Đồng bộ DB</span>
          </button>
          <button
            type="button"
            onClick={() => setShowAddModal(!showAddModal)}
            className="ts-cta text-xs py-2 px-4 inline-flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Thêm Biến Thể SKU Mới</span>
          </button>
        </div>
      </div>

      {msg && (
        <div
          role="alert"
          className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
            msg.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {msg.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          )}
          <span>{msg.text}</span>
        </div>
      )}

      {showAddModal && (
        <form
          onSubmit={handleCreateProduct}
          className="bg-white rounded-2xl border border-blue-200 p-6 shadow-md space-y-4 text-xs"
        >
          <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2.5">
            Tạo Mới Sản Phẩm &amp; Biến Thể Laptop
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Mã SKU:</label>
              <input
                type="text"
                value={newSku}
                onChange={(e) => setNewSku(e.target.value)}
                placeholder="VD: LT-HP-PAV15-2026"
                required
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono text-slate-900"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">Tên Laptop:</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="VD: Laptop HP Pavilion 15 (2026)"
                required
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">Hãng sản xuất:</label>
              <select
                value={newBrand}
                onChange={(e) => setNewBrand(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900"
              >
                <option value="ASUS">ASUS</option>
                <option value="DELL">DELL</option>
                <option value="LENOVO">LENOVO</option>
                <option value="ACER">ACER</option>
                <option value="APPLE">APPLE</option>
                <option value="HP">HP</option>
              </select>
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">
                Giá Niêm Yết VNĐ:
              </label>
              <input
                type="text"
                value={newPriceVnd}
                onChange={(e) => setNewPriceVnd(e.target.value)}
                required
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold text-blue-600 tabular-nums"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">Vi xử lý (CPU):</label>
              <input
                type="text"
                value={newCpu}
                onChange={(e) => setNewCpu(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">RAM (GB):</label>
              <select
                value={newRam}
                onChange={(e) => setNewRam(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900"
              >
                <option value={8}>8 GB</option>
                <option value={16}>16 GB</option>
                <option value={32}>32 GB</option>
                <option value={64}>64 GB</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold"
            >
              Hủy
            </button>
            <button type="submit" disabled={isSubmitting} className="ts-cta py-2 px-5 font-bold disabled:opacity-50">
              {isSubmitting ? 'Đang lưu...' : 'Lưu Sản Phẩm'}
            </button>
          </div>
        </form>
      )}

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo SKU hoặc tên sản phẩm..."
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
          />
        </div>
        <span className="text-xs font-bold text-slate-500">
          Tổng số biến thể: {filtered.length} SKUs
        </span>
      </div>

      {/* PIM Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase">
              <tr>
                <th className="py-3.5 px-4">SKU &amp; Tên Sản Phẩm</th>
                <th className="py-3.5 px-4">Hãng</th>
                <th className="py-3.5 px-4">Cấu Hình (CPU / RAM / SSD)</th>
                <th className="py-3.5 px-4">Giá Niêm Yết</th>
                <th className="py-3.5 px-4 text-center">Trạng Thái</th>
                <th className="py-3.5 px-4 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    Chưa có sản phẩm nào phù hợp với bộ lọc tìm kiếm.
                  </td>
                </tr>
              )}
              {filtered.map((item) => (
                <tr key={item.sku} className="hover:bg-slate-50/80">
                  <td className="py-3.5 px-4">
                    <div className="font-bold text-slate-900">{item.name}</div>
                    <div className="font-mono text-[11px] text-slate-400">{item.sku}</div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded font-bold">
                      {item.brand}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-600">
                    {item.cpuModel} • {item.ramGb > 0 ? <strong>{item.ramGb}GB RAM</strong> : 'RAM: Chưa có thông tin'} • {item.storageGb > 0 ? `${item.storageGb}GB SSD` : 'SSD: Chưa có thông tin'}
                  </td>
                  <td className="py-3.5 px-4 font-extrabold text-blue-600 tabular-nums">
                    {item.formattedPrice}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        item.active ? 'ts-badge-success' : 'ts-badge-danger'
                      }`}
                    >
                      {item.active ? 'Đang Mở Bán' : 'Tạm Khóa Bán'}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(item.sku)}
                      className="px-3 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 font-bold text-slate-700 inline-flex items-center gap-1"
                    >
                      <Power className="w-3 h-3" />
                      <span>{item.active ? 'Khóa bán' : 'Mở bán'}</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </BrandSectionBackground>
  );
}
