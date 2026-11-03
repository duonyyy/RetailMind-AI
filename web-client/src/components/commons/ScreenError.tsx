'use client';

import React from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';

interface ScreenErrorProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ScreenError({
  title = 'Đã xảy ra lỗi kết nối',
  message = 'Không thể đồng bộ dữ liệu với máy chủ. Vui lòng kiểm tra lại đường truyền.',
  onRetry,
  className = '',
}: ScreenErrorProps) {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center p-8 text-center rounded-2xl border border-rose-200 bg-rose-50/70 shadow-xs ${className}`}
    >
      <div className="w-12 h-12 rounded-2xl bg-rose-100 border border-rose-200 flex items-center justify-center mb-3 text-rose-600">
        <AlertCircle className="w-6 h-6" />
      </div>
      <h3 className="text-sm font-bold text-rose-900">{title}</h3>
      <p className="text-xs text-rose-700 max-w-sm mt-1 leading-relaxed">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 shadow-xs transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Thử lại</span>
        </button>
      )}
    </div>
  );
}
