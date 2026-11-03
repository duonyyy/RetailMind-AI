'use client';

import React from 'react';
import Link from 'next/link';
import { BrandSectionBackground } from '@/components/patterns';
import { AlertCircle, RefreshCw, Home, ShoppingBag } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <BrandSectionBackground
      variant="soft-blue"
      pattern="dot"
      patternOpacity={0.05}
      withGlow={true}
      className="min-h-full p-6 sm:p-10 flex items-center justify-center"
    >
      <div className="max-w-lg w-full bg-white rounded-2xl border border-slate-200 p-8 shadow-sm space-y-5 text-center">
        <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 mx-auto flex items-center justify-center">
          <AlertCircle className="w-6 h-6" />
        </div>

        <div className="space-y-1.5">
          <h1 className="text-lg font-bold text-slate-900">
            Đã xảy ra sự cố khi tải trang
          </h1>
          <p className="text-xs text-slate-500">
            {error?.message || 'Kết nối tạm thời bị gián đoạn hoặc trang gặp lỗi bất ngờ. Quý khách vui lòng thử lại.'}
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="ts-cta py-2.5 px-5 text-xs font-bold inline-flex items-center gap-1.5 w-full sm:w-auto justify-center"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Thử tải lại</span>
          </button>
          <Link
            href="/catalog"
            className="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 w-full sm:w-auto justify-center transition"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Về danh mục sản phẩm</span>
          </Link>
          <Link
            href="/"
            className="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 w-full sm:w-auto justify-center transition"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Trang chủ</span>
          </Link>
        </div>
      </div>
    </BrandSectionBackground>
  );
}
