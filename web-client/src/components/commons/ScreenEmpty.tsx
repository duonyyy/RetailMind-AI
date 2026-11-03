'use client';

import React from 'react';
import Link from 'next/link';
import { PackageOpen } from 'lucide-react';

interface ScreenEmptyProps {
  title?: string;
  description?: string;
  actionText?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
}

export function ScreenEmpty({
  title = 'Không tìm thấy dữ liệu',
  description = 'Chưa có bản ghi nào phù hợp với bộ lọc tìm kiếm hiện tại.',
  actionText,
  actionLabel,
  actionHref,
  onAction,
  className = '',
}: ScreenEmptyProps) {
  const label = actionText || actionLabel;

  return (
    <div
      role="status"
      className={`flex flex-col items-center justify-center p-10 text-center rounded-2xl border border-dashed border-slate-300 bg-white/70 shadow-xs ${className}`}
    >
      <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center mb-3 text-slate-400">
        <PackageOpen className="w-7 h-7" />
      </div>
      <h3 className="text-base font-bold text-slate-800">{title}</h3>
      <p className="text-xs text-slate-500 max-w-sm mt-1 leading-relaxed">{description}</p>
      {label && actionHref && (
        <Link
          href={actionHref}
          className="mt-4 px-4 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-xs inline-block"
        >
          {label}
        </Link>
      )}
      {label && !actionHref && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 px-4 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-xs"
        >
          {label}
        </button>
      )}
    </div>
  );
}
