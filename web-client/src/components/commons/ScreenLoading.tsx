'use client';

import React from 'react';
import { RefreshCw } from 'lucide-react';

interface ScreenLoadingProps {
  message?: string;
  className?: string;
}

export function ScreenLoading({
  message = 'Đang tải dữ liệu từ máy chủ...',
  className = '',
}: ScreenLoadingProps) {
  return (
    <div
      role="status"
      className={`flex flex-col items-center justify-center p-10 space-y-3 rounded-2xl border border-slate-200 bg-white/70 shadow-xs ${className}`}
    >
      <RefreshCw className="w-6 h-6 text-blue-600 animate-spin" />
      <p className="text-xs font-semibold text-slate-500">{message}</p>
    </div>
  );
}
