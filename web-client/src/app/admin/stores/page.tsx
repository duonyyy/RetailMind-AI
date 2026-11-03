'use client';

import React, { useState, useEffect } from 'react';
import { BrandSectionBackground } from '@/components/patterns';
import { apiFetch } from '@/lib/api-client';
import { ScreenEmpty } from '@/components/commons/ScreenEmpty';
import { ScreenError } from '@/components/commons/ScreenError';
import { ScreenLoading } from '@/components/commons/ScreenLoading';
import {
  Building2,
  MapPin,
  Phone,
  RefreshCw,
  Store,
} from 'lucide-react';

interface StoreRecord {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  city?: string;
  isActive?: boolean;
}

export default function AdminStoresPage() {
  const [stores, setStores] = useState<StoreRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStores = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<any>('inventory/stores', { retries: 0 });
      if (!res.success) {
        throw new Error(res.error?.message || 'Không thể tải danh sách chi nhánh.');
      }
      const raw = Array.isArray(res.data) ? res.data : (res.data as any)?.data || [];
      if (Array.isArray(raw)) {
        setStores(raw);
      } else {
        setStores([]);
      }
    } catch (err) {
      setStores([]);
      setError(err instanceof Error ? err.message : 'Lỗi kết nối khi tải danh sách siêu thị.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStores();
  }, []);

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
            <Building2 className="w-5 h-5 text-blue-600" />
            <span>Mạng Lưới Chi Nhánh &amp; Siêu Thị MWG</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Danh sách các chi nhánh siêu thị tiếp nhận đơn hàng và giữ tồn kho trực tiếp từ Core API.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchStores}
          disabled={loading}
          className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 inline-flex items-center gap-1.5 shadow-xs transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Làm mới danh sách</span>
        </button>
      </div>

      {loading && <ScreenLoading message="Đang tải danh sách chi nhánh..." />}

      {error && !loading && (
        <ScreenError
          title="Không thể tải chi nhánh"
          message={error}
          onRetry={fetchStores}
        />
      )}

      {!loading && !error && stores.length === 0 && (
        <ScreenEmpty
          title="Chưa có chi nhánh nào"
          description="Hệ thống Core API chưa có bản ghi chi nhánh siêu thị nào."
        />
      )}

      {!loading && !error && stores.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {stores.map((st) => (
            <div key={st.id} className="ts-feature-card p-6 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded-md truncate max-w-[150px]">
                    {st.id.slice(0, 8)}...
                  </span>
                  <span className="ts-badge-success text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                    Sẵn sàng tiếp nhận
                  </span>
                </div>

                <h2 className="text-base font-bold text-slate-900">{st.name}</h2>

                <div className="space-y-2 text-xs text-slate-600">
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                    <span>{st.address || 'Chưa cập nhật địa chỉ'}</span>
                  </div>
                  {st.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{st.phone}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-400">
                Dữ liệu định tuyến kho phục vụ tạo đơn hàng tại chỗ.
              </div>
            </div>
          ))}
        </div>
      )}
    </BrandSectionBackground>
  );
}
