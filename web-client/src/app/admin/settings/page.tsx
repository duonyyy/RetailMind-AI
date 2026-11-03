'use client';

import React from 'react';
import Link from 'next/link';
import { BrandSectionBackground } from '@/components/patterns';
import { useCurrentUser } from '@/features/auth/useCurrentUser';
import { ScreenLoading } from '@/components/commons/ScreenLoading';
import { ScreenEmpty } from '@/components/commons/ScreenEmpty';
import {
  Settings,
  ShieldCheck,
  Zap,
  Server,
  Info,
  Lock,
} from 'lucide-react';

export default function AdminResilienceSettingsPage() {
  const { user, isLoading } = useCurrentUser();

  if (isLoading) {
    return <ScreenLoading message="Đang tải cấu hình hệ thống..." />;
  }

  if (!user || user.role !== 'ADMIN') {
    return (
      <ScreenEmpty
        title="Quyền truy cập bị từ chối"
        description="Trang cấu hình hệ thống chỉ dành cho tài khoản Quản trị viên (ADMIN)."
        actionLabel="Về trang chủ"
        actionHref="/"
      />
    );
  }

  const rateLimitRpm = 30;
  const cbFailureThreshold = 50;
  const cbRecoverySeconds = 15;
  const cacheTtlSeconds = 300;
  const maxAgentSteps = 5;

  return (
    <BrandSectionBackground
      variant="soft-blue"
      pattern="dot"
      patternOpacity={0.05}
      withGlow={true}
      className="min-h-full p-6 sm:p-8 space-y-6"
    >
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <Settings className="w-5 h-5 text-blue-600" />
          <span>Cấu Hình Tham Số Hệ Thống &amp; Khả Năng Tự Phục Hồi</span>
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Thông số bảo vệ hạ tầng, giới hạn tần suất, Circuit Breaker và trần suy luận của Agentic Runtime.
        </p>
      </div>

      <div className="p-4 rounded-xl bg-blue-50/80 border border-blue-200 text-xs text-blue-900 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold">Chế độ quản lý hạ tầng:</span> Các tham số dưới đây được cấu hình tĩnh thông qua biến môi trường container (Environment Variables). Mọi thay đổi cấu hình cần được cập nhật vào tệp cấu hình triển khai và khởi động lại dịch vụ tương ứng.
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
        {/* Left: Rate Limiter & Circuit Breaker */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <span>1. Phòng Vệ Lưu Lượng (Rate Limiter &amp; Circuit Breaker)</span>
          </h2>

          <div className="space-y-3">
            <div>
              <div className="font-semibold text-slate-700 mb-1">
                Giới hạn tần suất yêu cầu (Rate Limit):
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 font-mono font-bold text-slate-900 flex justify-between items-center">
                <span>{rateLimitRpm} req/phút/IP</span>
                <span className="text-[10px] text-slate-400 font-normal">RATE_LIMIT_RPM</span>
              </div>
            </div>

            <div>
              <div className="font-semibold text-slate-700 mb-1">
                Ngưỡng ngắt mạch Circuit Breaker:
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 font-mono font-bold text-slate-900 flex justify-between items-center">
                <span>{cbFailureThreshold}% lỗi trong 10 giây</span>
                <span className="text-[10px] text-slate-400 font-normal">CB_THRESHOLD</span>
              </div>
            </div>

            <div>
              <div className="font-semibold text-slate-700 mb-1">
                Thời gian chờ phục hồi Half-Open:
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 font-mono font-bold text-slate-900 flex justify-between items-center">
                <span>{cbRecoverySeconds} giây</span>
                <span className="text-[10px] text-slate-400 font-normal">CB_RECOVERY_SEC</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Agentic Runtime & Cache */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />
            <span>2. Ranh Giới Tác Tử (Agent Guardrails &amp; Cache)</span>
          </h2>

          <div className="space-y-3">
            <div>
              <div className="font-semibold text-slate-700 mb-1">
                Trần số bước suy luận tối đa (chống vòng lặp vô tận):
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 font-mono font-bold text-blue-600 flex justify-between items-center">
                <span>{maxAgentSteps} bước</span>
                <span className="text-[10px] text-slate-400 font-normal">MAX_STEPS</span>
              </div>
            </div>

            <div>
              <div className="font-semibold text-slate-700 mb-1">
                Thời gian sống bộ đệm danh mục (Cache TTL):
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 font-mono font-bold text-slate-900 flex justify-between items-center">
                <span>{cacheTtlSeconds} giây (5 phút)</span>
                <span className="text-[10px] text-slate-400 font-normal">CACHE_TTL_SEC</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 mt-2">
              <div className="font-bold text-slate-800 flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-blue-600" />
                <span>Đầu Mối Kết Nối Nội Bộ BFF Proxy:</span>
              </div>
              <div className="font-mono text-[11px] text-slate-600">
                Core API: <span className="text-slate-900 font-semibold">http://localhost:4000/api/v1</span>
              </div>
              <div className="font-mono text-[11px] text-slate-600">
                Agent System: <span className="text-slate-900 font-semibold">http://localhost:8000/api</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </BrandSectionBackground>
  );
}
