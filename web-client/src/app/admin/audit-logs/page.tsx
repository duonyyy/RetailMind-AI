'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { BrandSectionBackground } from '@/components/patterns';
import { apiFetch } from '@/lib/api-client';
import { ScreenEmpty } from '@/components/commons/ScreenEmpty';
import { ScreenError } from '@/components/commons/ScreenError';
import { ScreenLoading } from '@/components/commons/ScreenLoading';
import {
  ClipboardList,
  Search,
  RefreshCw,
  SlidersHorizontal,
  User,
  Clock,
  ShieldCheck,
  FileCode,
} from 'lucide-react';

interface AuditEvent {
  id: string;
  action: string;
  entityType?: string;
  entity_type?: string;
  entityId?: string;
  entity_id?: string;
  actorId?: string;
  actor_id?: string;
  details?: Record<string, any>;
  payload?: Record<string, any>;
  createdAt?: string;
  created_at?: string;
  eventHash?: string;
  event_hash?: string;
}

export default function AdminAuditLogsPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAction, setSelectedAction] = useState('ALL');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<any>('audit', { retries: 0 });
      if (!res.success) {
        throw new Error(res.error?.message || 'Không thể tải nhật ký kiểm toán từ máy chủ.');
      }
      const list = Array.isArray(res.data) ? res.data : res.data?.items;
      if (!Array.isArray(list)) {
        throw new Error('Dữ liệu nhật ký kiểm toán không hợp lệ.');
      }
      setEvents(list);
    } catch (err) {
      setEvents([]);
      setError(err instanceof Error ? err.message : 'Lỗi khi tải nhật ký kiểm toán.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const filteredEvents = events.filter((ev) => {
    if (selectedAction !== 'ALL' && ev.action !== selectedAction) return false;
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const actor = (ev.actor_id || ev.actorId || '').toLowerCase();
    const entity = (ev.entity_id || ev.entityId || '').toLowerCase();
    const action = ev.action.toLowerCase();
    return actor.includes(term) || entity.includes(term) || action.includes(term);
  });

  const getActionBadgeClass = (action: string) => {
    const act = action.toUpperCase();
    if (act.includes('CANCEL') || act.includes('DELETE') || act.includes('REJECT')) {
      return 'bg-rose-50 text-rose-700 border-rose-200';
    }
    if (act.includes('CREATE') || act.includes('ADJUST') || act.includes('APPROVE') || act.includes('COMPLETE')) {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
    if (act.includes('ORDER') || act.includes('RESERVE')) {
      return 'bg-blue-50 text-blue-700 border-blue-200';
    }
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  return (
    <BrandSectionBackground
      variant="soft-blue"
      pattern="dot"
      patternOpacity={0.05}
      withGlow={true}
      className="min-h-full p-4 sm:p-8 space-y-6"
    >
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-blue-600" />
              <span>Nhật Ký Kiểm Toán Hệ Thống (Audit Ledger)</span>
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Ghi nhận lưu vết các thao tác quản trị và thay đổi giao dịch được xác nhận bởi Core API.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchLogs}
              disabled={loading}
              className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 inline-flex items-center gap-1.5 shadow-xs transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Làm mới nhật ký</span>
            </button>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 flex-wrap text-xs font-semibold">
            <span className="text-slate-500 mr-1 flex items-center gap-1">
              <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600" /> Hành động:
            </span>
            {['ALL', 'INVENTORY_ADJUST', 'ORDER_CHECKOUT', 'ORDER_CANCEL', 'PRODUCT_TOGGLE'].map(
              (act) => (
                <button
                  key={act}
                  type="button"
                  onClick={() => setSelectedAction(act)}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    selectedAction === act
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {act === 'ALL' ? 'Tất cả' : act}
                </button>
              )
            )}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm theo người thực hiện, đối tượng..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Status / Notice */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Hiển thị trực tiếp bằng chứng sự kiện từ cơ sở dữ liệu Core. Không tự tạo băm ở trình duyệt.</span>
          </span>
          <span className="font-bold text-slate-700 tabular-nums">
            Tổng: {filteredEvents.length} sự kiện
          </span>
        </div>

        {/* Content States */}
        {loading && <ScreenLoading message="Đang tải các bản ghi nhật ký kiểm toán..." />}

        {error && !loading && (
          <ScreenError
            title="Lỗi tải nhật ký kiểm toán"
            message={error}
            onRetry={fetchLogs}
          />
        )}

        {!loading && !error && filteredEvents.length === 0 && (
          <ScreenEmpty
            title="Chưa có sự kiện kiểm toán"
            description="Hệ thống chưa ghi nhận sự kiện kiểm toán nào phù hợp với bộ lọc tìm kiếm hiện tại."
          />
        )}

        {!loading && !error && filteredEvents.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-3.5 px-4">Thời gian</th>
                    <th className="py-3.5 px-4">Người thực hiện</th>
                    <th className="py-3.5 px-4">Hành động</th>
                    <th className="py-3.5 px-4">Đối tượng</th>
                    <th className="py-3.5 px-4">Chi tiết thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredEvents.map((event) => {
                    const rawTime = event.created_at || event.createdAt;
                    const timeStr = rawTime
                      ? new Date(rawTime).toLocaleString('vi-VN')
                      : 'Chưa có thông tin';
                    const actor = event.actor_id || event.actorId || 'Hệ thống';
                    const entityType = event.entity_type || event.entityType || 'Chưa phân loại';
                    const entityId = event.entity_id || event.entityId || 'N/A';
                    const detailsObj = event.details || event.payload;
                    const detailsStr = detailsObj
                      ? typeof detailsObj === 'string'
                        ? detailsObj
                        : JSON.stringify(detailsObj)
                      : 'Không có chi tiết bổ sung';

                    return (
                      <tr key={event.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{timeStr}</span>
                          </div>
                          <span className="font-mono text-[10px] text-slate-400 block pt-0.5">
                            #{event.id.slice(0, 8)}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="font-mono font-bold text-slate-800 flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span>{actor}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getActionBadgeClass(
                              event.action
                            )}`}
                          >
                            {event.action}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-800">{entityType}</div>
                          <div className="font-mono text-[11px] text-blue-600 truncate max-w-[180px]">
                            {entityId}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 font-mono text-[11px] max-w-xs truncate">
                          {detailsStr}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </BrandSectionBackground>
  );
}
