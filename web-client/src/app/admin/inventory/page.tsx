'use client';

import React, { useState, useEffect } from 'react';
import { BrandSectionBackground } from '@/components/patterns';
import {
  getBranchInventoryMatrix,

} from '@/features/admin-inventory/services/inventory.get';
import { adjustBranchStockAction } from '@/features/admin-inventory/services/inventory.action';
import { BranchInventoryRecord } from '@/features/admin-inventory/types';
import {
  Warehouse,
  Search,
  PlusCircle,
  CheckCircle2,
  ShieldCheck,
  RefreshCw,
  Database,
  SlidersHorizontal,
} from 'lucide-react';

export default function AdminInventoryPage() {
  const [selectedBranch, setSelectedBranch] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [inventory, setInventory] = useState<BranchInventoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [deltaQty, setDeltaQty] = useState<number>(5);
  const [adjustReason, setAdjustReason] = useState('Nhập bổ sung lô hàng mới từ kho tổng MWG');
  const [auditToast, setAuditToast] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadInventory = async () => {
    setIsLoading(true);
    try {
      const data = await getBranchInventoryMatrix();
      setInventory(data);
    } catch {
      setInventory([]);
      setAuditToast('Không thể tải dữ liệu tồn kho.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadInventory();
  }, []);

  const handleApplyAdjust = async (id: string) => {
    const row = inventory.find((r) => r.id === id);
    if (!row) return;

    const newPhysical = Math.max(row.reservedQty, row.physicalQty + deltaQty);
    setIsSubmitting(true);

    try {
      const res = await adjustBranchStockAction({
        branchCode: row.branchCode,
        sku: row.sku,
        deltaQty,
        newPhysicalQty: newPhysical,
        reason: adjustReason,
        initiatedBy: 'admin',
      });

      setInventory((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          return {
            ...r,
            physicalQty: newPhysical,
            availableQty: newPhysical - r.reservedQty,
            lastUpdated: 'Vừa cập nhật',
          };
        })
      );

      setAdjustingId(null);
      setAuditToast(
        `Core xác nhận cập nhật tồn kho (Lý do: "${adjustReason}").`
      );
      loadInventory();
    } catch {
      setAuditToast(`Lỗi khi cập nhật tồn kho.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filtered = inventory.filter((item) => {
    if (selectedBranch !== 'ALL' && item.branchCode !== selectedBranch) return false;
    if (
      searchTerm &&
      !item.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !item.sku.toLowerCase().includes(searchTerm.toLowerCase())
    )
      return false;
    return true;
  });

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
            <Warehouse className="w-5 h-5 text-blue-600" />
            <span>Quản Lý Tồn Kho Chi Nhánh (Inventory Hub)</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-blue-600" />
            <span>
              Giám sát tồn vật lý, tồn giữ chỗ và tồn khả dụng thời gian thực tại các chi nhánh siêu thị.
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadInventory()}
            disabled={isLoading}
            className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-bold inline-flex items-center gap-1.5 shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Làm Mới Tồn Kho</span>
          </button>
        </div>
      </div>

      {auditToast && (
        <div
          role="status"
          className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800 flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{auditToast}</span>
        </div>
      )}

      {/* Filter by Branch & Search */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 flex-wrap text-xs font-semibold">
            <span className="text-slate-500 mr-1 flex items-center gap-1">
              <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600" /> Chi nhánh:
            </span>
            {[
              { id: 'ALL', label: 'Tất cả siêu thị' },
              { id: 'MWG_HCM_001', label: 'HCM (136 Nguyễn Thái Học)' },
              { id: 'MWG_HN_002', label: 'Hà Nội (117 Thái Hà)' },
              { id: 'MWG_DN_003', label: 'Đà Nẵng (320 đường 2/9)' },
            ].map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setSelectedBranch(b.id)}
                className={`px-3 py-1.5 rounded-lg transition ${
                  selectedBranch === b.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm theo SKU hoặc tên máy..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
            />
          </div>
        </div>
      </div>

      {/* Inventory Matrix Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-4">Sản Phẩm &amp; SKU</th>
                <th className="py-3.5 px-4">Chi Nhánh</th>
                <th className="py-3.5 px-4 text-center">Tồn Vật Lý</th>
                <th className="py-3.5 px-4 text-center">Đang Giữ Chỗ</th>
                <th className="py-3.5 px-4 text-center">Khả Dụng</th>
                <th className="py-3.5 px-4 text-center">Ngưỡng An Toàn</th>
                <th className="py-3.5 px-4">Cập Nhật</th>
                <th className="py-3.5 px-4 text-right">Điều Chỉnh Kho</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    Chưa có bản ghi tồn kho nào phù hợp với bộ lọc tìm kiếm.
                  </td>
                </tr>
              )}
              {filtered.map((item) => {
                const isLow = item.availableQty <= item.safetyThreshold;
                const isEditing = adjustingId === item.id;

                return (
                  <tr key={item.id} className="hover:bg-slate-50/80">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900">{item.name}</div>
                      <div className="font-mono text-[11px] text-slate-400">{item.sku}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-800">{item.branchName}</div>
                      <div className="font-mono text-[10px] text-slate-400">{item.branchCode}</div>
                    </td>
                    <td className="py-3.5 px-4 text-center font-bold tabular-nums">
                      {item.physicalQty}
                    </td>
                    <td className="py-3.5 px-4 text-center font-bold text-amber-600 tabular-nums">
                      {item.reservedQty}
                    </td>
                    <td className="py-3.5 px-4 text-center font-extrabold tabular-nums">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] ${
                          isLow
                            ? 'bg-rose-100 text-rose-700 border border-rose-200 font-bold'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {item.availableQty} máy
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center tabular-nums text-slate-500 font-semibold">
                      ≥ {item.safetyThreshold}
                    </td>
                    <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                      {item.lastUpdated}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {isEditing ? (
                        <div className="inline-flex flex-col items-end gap-1.5 p-2 bg-blue-50 rounded-xl border border-blue-200">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              value={deltaQty}
                              onChange={(e) => setDeltaQty(Number(e.target.value))}
                              className="w-16 bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-center font-bold"
                            />
                            <button
                              type="button"
                              disabled={isSubmitting}
                              onClick={() => handleApplyAdjust(item.id)}
                              className="ts-cta py-1 px-2.5 text-[11px] font-bold disabled:opacity-50"
                            >
                              {isSubmitting ? 'Lưu...' : 'Lưu SSOT'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setAdjustingId(null)}
                              className="px-2 py-1 rounded-lg bg-slate-200 text-slate-700 text-[11px] font-bold"
                            >
                              Hủy
                            </button>
                          </div>
                          <input
                            type="text"
                            value={adjustReason}
                            onChange={(e) => setAdjustReason(e.target.value)}
                            placeholder="Lý do điều chỉnh..."
                            className="w-48 bg-white border border-slate-300 rounded-lg px-2 py-0.5 text-[10px]"
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setAdjustingId(item.id);
                            setDeltaQty(5);
                          }}
                          className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 font-bold text-slate-700 inline-flex items-center gap-1.5 text-xs transition"
                        >
                          <PlusCircle className="w-3.5 h-3.5 text-blue-600" />
                          <span>Điều chỉnh</span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </BrandSectionBackground>
  );
}
