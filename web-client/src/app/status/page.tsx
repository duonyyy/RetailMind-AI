'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { BrandSectionBackground } from '@/components/patterns';
import { apiFetch } from '@/lib/api-client';
import {
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Server,
  RefreshCw,
  Database,
  Cpu,
  Layers,
} from 'lucide-react';

interface ServiceStatus {
  name: string;
  role: string;
  endpoint: string;
  latencyMs: number | null;
  status: 'OPERATIONAL' | 'DEGRADED' | 'UNAVAILABLE' | 'UNKNOWN';
  detail: string;
}

export default function ServiceStatusPage() {
  const [lastChecked, setLastChecked] = useState<string>('Chưa kiểm tra');
  const [isProbing, setIsProbing] = useState(false);
  const [services, setServices] = useState<ServiceStatus[]>([
    {
      name: 'NestJS Core Commerce API',
      role: 'Giao dịch thương mại, giỏ hàng, đơn hàng và kho hàng',
      endpoint: '/api/proxy/catalog/products',
      latencyMs: null,
      status: 'UNKNOWN',
      detail: 'Chưa thực hiện kiểm tra kết nối',
    },
    {
      name: 'Python LangGraph Agent Runtime',
      role: 'Điều phối luồng hội thoại tác tử AI & tính toán FinOps',
      endpoint: '/api/proxy/finops',
      latencyMs: null,
      status: 'UNKNOWN',
      detail: 'Chưa thực hiện kiểm tra kết nối',
    },
    {
      name: 'PostgreSQL SSOT Database',
      role: 'Nguồn chân lý dữ liệu giao dịch, giá niêm yết và tồn kho khả dụng',
      endpoint: 'Kết nối nội bộ qua Core API',
      latencyMs: null,
      status: 'UNKNOWN',
      detail: 'Xác định qua tình trạng phản hồi truy vấn dữ liệu Core API',
    },
    {
      name: 'Qdrant Vector Engine',
      role: 'Chỉ mục vector thứ cấp phục vụ tìm kiếm ngữ nghĩa',
      endpoint: 'Kết nối nội bộ mạng container (:6333)',
      latencyMs: null,
      status: 'UNKNOWN',
      detail: 'Truy cập nội bộ qua Agentic Runtime',
    },
  ]);

  const runProbe = useCallback(async () => {
    setIsProbing(true);
    const updated = [...services];

    // 1. Probe Core API via catalog query
    const t0 = performance.now();
    let coreOk = false;
    try {
      const res = await apiFetch<any>('catalog/products?limit=1', { retries: 0 });
      const latency = Math.round(performance.now() - t0);
      coreOk = res.success;
      updated[0] = {
        ...updated[0],
        latencyMs: latency,
        status: res.success ? 'OPERATIONAL' : 'DEGRADED',
        detail: res.success
          ? `Phản hồi thành công (${latency} ms)`
          : `Lỗi: ${res.error?.message || 'Không có phản hồi'}`,
      };
    } catch (err: any) {
      updated[0] = {
        ...updated[0],
        latencyMs: null,
        status: 'UNAVAILABLE',
        detail: err?.message || 'Không thể kết nối tới Core API',
      };
    }

    // 2. Probe Agent Runtime via finops query
    const t1 = performance.now();
    try {
      const res = await apiFetch<any>('finops', { retries: 0 });
      const latency = Math.round(performance.now() - t1);
      updated[1] = {
        ...updated[1],
        latencyMs: latency,
        status: res.success ? 'OPERATIONAL' : 'DEGRADED',
        detail: res.success
          ? `Phản hồi thành công (${latency} ms)`
          : `Lỗi: ${res.error?.message || 'Không có phản hồi'}`,
      };
    } catch (err: any) {
      updated[1] = {
        ...updated[1],
        latencyMs: null,
        status: 'UNAVAILABLE',
        detail: err?.message || 'Không thể kết nối tới Agent System',
      };
    }

    // 3. PostgreSQL status derived from Core API catalog success
    if (coreOk) {
      updated[2] = {
        ...updated[2],
        latencyMs: null,
        status: 'OPERATIONAL',
        detail: 'Kết nối bình thường thông qua Core API',
      };
    } else {
      updated[2] = {
        ...updated[2],
        latencyMs: null,
        status: updated[0].status === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'DEGRADED',
        detail: 'Không thể xác nhận qua Core API',
      };
    }

    // 4. Qdrant status
    updated[3] = {
      ...updated[3],
      latencyMs: null,
      status: updated[1].status === 'OPERATIONAL' ? 'OPERATIONAL' : 'UNKNOWN',
      detail:
        updated[1].status === 'OPERATIONAL'
          ? 'Đang hoạt động qua Agent System'
          : 'Chưa có thông tin kết nối',
    };

    setServices(updated);
    setLastChecked(new Date().toLocaleTimeString('vi-VN'));
    setIsProbing(false);
  }, [services]);

  useEffect(() => {
    runProbe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const operationalCount = services.filter((s) => s.status === 'OPERATIONAL').length;

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
            <Activity className="w-5 h-5 text-emerald-600" />
            <span>Tình Trạng Kết Nối Dịch Vụ Hệ Thống</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Kiểm tra khả năng phản hồi trực tiếp của các thành phần dịch vụ. Lần kiểm tra gần nhất: {lastChecked}.
          </p>
        </div>

        <button
          type="button"
          onClick={runProbe}
          disabled={isProbing}
          className="ts-cta py-2 px-4 text-xs font-bold inline-flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isProbing ? 'animate-spin' : ''}`} />
          <span>Kiểm Tra Kết Nối Ngay</span>
        </button>
      </div>

      {/* Overall Banner */}
      <div
        className={`p-5 rounded-2xl flex items-center justify-between border ${
          operationalCount === services.length
            ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
            : operationalCount > 0
            ? 'bg-amber-50 border-amber-200 text-amber-950'
            : 'bg-rose-50 border-rose-200 text-rose-950'
        }`}
      >
        <div className="flex items-center gap-3">
          <span
            className={`w-3 h-3 rounded-full ${
              operationalCount === services.length
                ? 'bg-emerald-500'
                : operationalCount > 0
                ? 'bg-amber-500'
                : 'bg-rose-500'
            }`}
          />
          <div>
            <div className="text-sm font-extrabold">
              {operationalCount === services.length
                ? 'Tất cả các dịch vụ được kiểm tra đang phản hồi bình thường'
                : operationalCount > 0
                ? `${operationalCount}/${services.length} dịch vụ đang phản hồi bình thường`
                : 'Các dịch vụ kiểm tra hiện chưa thể kết nối'}
            </div>
            <div className="text-xs opacity-80 mt-0.5">
              Kết quả được đo lường thực tế qua API BFF Reverse Proxy.
            </div>
          </div>
        </div>
      </div>

      {/* Services List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs divide-y divide-slate-100">
        {services.map((svc) => (
          <div
            key={svc.name}
            className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs"
          >
            <div className="space-y-1">
              <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Server className="w-4 h-4 text-blue-600" />
                <span>{svc.name}</span>
              </div>
              <p className="text-slate-500">{svc.role}</p>
              <div className="font-mono text-[11px] text-slate-400">
                Đích kiểm tra: {svc.endpoint}
              </div>
            </div>

            <div className="flex items-center gap-4 shrink-0">
              <div className="text-right">
                <div className="text-[10px] text-slate-400 uppercase font-bold">Độ trễ đo được</div>
                <div className="font-mono font-bold text-slate-800 tabular-nums">
                  {svc.latencyMs !== null ? `${svc.latencyMs} ms` : 'Chưa có thông tin'}
                </div>
              </div>

              {svc.status === 'OPERATIONAL' && (
                <span className="px-3 py-1 rounded-full font-bold inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Hoạt động</span>
                </span>
              )}
              {svc.status === 'DEGRADED' && (
                <span className="px-3 py-1 rounded-full font-bold inline-flex items-center gap-1.5 bg-amber-50 text-amber-800 border border-amber-200">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  <span>Chậm / Bất thường</span>
                </span>
              )}
              {svc.status === 'UNAVAILABLE' && (
                <span className="px-3 py-1 rounded-full font-bold inline-flex items-center gap-1.5 bg-rose-50 text-rose-800 border border-rose-200">
                  <XCircle className="w-3.5 h-3.5 text-rose-600" />
                  <span>Không kết nối được</span>
                </span>
              )}
              {svc.status === 'UNKNOWN' && (
                <span className="px-3 py-1 rounded-full font-bold inline-flex items-center gap-1.5 bg-slate-100 text-slate-600">
                  <span>Chưa xác định</span>
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </BrandSectionBackground>
  );
}
