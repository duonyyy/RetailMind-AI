'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { BrandSectionBackground } from '@/components/patterns';
import {
  Activity,
  Zap,
  ExternalLink,
  Layers,
  RefreshCw,
  Cpu,
  ShieldCheck,
} from 'lucide-react';

interface FinOpsMetrics {
  total_requests: number;
  total_calls: number;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_cost_usd: string;
  avg_latency_ms: number;
  circuit_state: string;
}

export default function AdminObservabilityPage() {
  const [metrics, setMetrics] = useState<FinOpsMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<string>('Đang tải...');

  const fetchMetrics = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/proxy/finops/metrics', {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });

      if (res.ok) {
        const data = await res.json();
        setMetrics(data);
      } else {
        setMetrics(null);
      }
    } catch {
      setMetrics(null);
    } finally {
      setIsLoading(false);
      setLastRefreshed(new Date().toLocaleTimeString('vi-VN'));
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  const phoenixEndpoint = 'http://localhost:6006';

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
            <Activity className="w-5 h-5 text-rose-600" />
            <span>Giám Sát Hạ Tầng Arize Phoenix &amp; FinOps Ledger</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Theo dõi chi phí FinOps, lượng token tiêu thụ và trạng thái Circuit Breaker thời gian thực từ Agent System.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={fetchMetrics}
            disabled={isLoading}
            className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 inline-flex items-center gap-1.5 shadow-xs transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Làm mới chỉ số</span>
          </button>
          <a
            href={phoenixEndpoint}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Mở Arize Phoenix UI</span>
          </a>
        </div>
      </div>

      {/* FinOps KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">Trạng Thái Circuit Breaker</span>
            <Zap className="w-4 h-4 text-amber-500" />
          </div>
          <span
            className={`text-xl font-extrabold block ${
              metrics?.circuit_state === 'OPEN'
                ? 'text-rose-600'
                : metrics?.circuit_state === 'HALF_OPEN'
                ? 'text-amber-600'
                : 'text-emerald-600'
            }`}
          >
            {metrics?.circuit_state || (isLoading ? 'Đang đọc...' : 'CLOSED (Bình thường)')}
          </span>
          <span className="text-[11px] text-slate-500 block">
            Ngưỡng ngắt mạch chống sập hệ thống
          </span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">Tổng Lượt Gọi (Requests)</span>
            <Layers className="w-4 h-4 text-blue-600" />
          </div>
          <span className="text-xl font-extrabold text-slate-900 tabular-nums block">
            {metrics ? `${metrics.total_requests} lượt` : isLoading ? 'Đang đọc...' : 'Chưa có dữ liệu'}
          </span>
          <span className="text-[11px] text-slate-500 block">
            Số lượt truy vấn ghi nhận bởi FinOps
          </span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">Tổng Tokens Tiêu Thụ</span>
            <Cpu className="w-4 h-4 text-indigo-600" />
          </div>
          <span className="text-xl font-extrabold text-blue-600 tabular-nums block">
            {metrics ? `${metrics.total_tokens.toLocaleString()} tokens` : isLoading ? 'Đang đọc...' : 'Chưa có dữ liệu'}
          </span>
          <span className="text-[11px] text-slate-500 block">
            {metrics ? `Prompt: ${metrics.prompt_tokens} • Completion: ${metrics.completion_tokens}` : 'Chưa ghi nhận tiêu thụ'}
          </span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">Ước Tính Chi Phí FinOps</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <span className="text-xl font-extrabold text-emerald-600 tabular-nums block">
            {metrics ? `$${metrics.total_cost_usd}` : isLoading ? 'Đang đọc...' : 'Chưa có chi phí'}
          </span>
          <span className="text-[11px] text-slate-500 block">
            Độ trễ trung bình: {metrics ? `${Math.round(metrics.avg_latency_ms)} ms` : 'Chưa đo'}
          </span>
        </div>
      </div>

      {/* Spans / OpenTelemetry Collector Trace Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Activity className="w-4 h-4 text-rose-600" />
            <span>Trace Spans &amp; GenAI Observability</span>
          </h2>
          <span className="text-xs text-slate-400">Lần đồng bộ gần nhất: {lastRefreshed}</span>
        </div>

        <div className="p-8 rounded-xl bg-slate-50 border border-slate-200 text-center space-y-3">
          <Activity className="w-10 h-10 text-slate-400 mx-auto" />
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-800">
              Cổng giám sát Arize Phoenix OpenTelemetry
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Toàn bộ chuỗi suy luận LLM (Trace Spans, Prompt Evaluation và Grounding metrics) được thu thập qua OpenTelemetry collector tại cổng 6006.
            </p>
          </div>
          <a
            href={phoenixEndpoint}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-xs transition"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Mở Bảng Điều Khiển Phoenix (Port 6006)</span>
          </a>
        </div>
      </div>
    </BrandSectionBackground>
  );
}
