'use client';

import React from 'react';
import { BrandSectionBackground } from '@/components/patterns';
import { Tag, ShieldAlert, CheckCircle2 } from 'lucide-react';

const SYSTEM_DEFAULT_PROMOTIONS = [
  {
    code: 'MWG_VIP500',
    description: 'Giảm trực tiếp 500.000 VNĐ cho đơn hàng Laptop (Quy tắc tính trong Core API)',
    discountAmount: '500.000 ₫',
    minOrder: '15.000.000 ₫',
    scope: 'Đã tích hợp trong module Orders Preview',
    status: 'ACTIVE',
  },
];

export default function AdminPromotionsPage() {
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
          <Tag className="w-5 h-5 text-blue-600" />
          <span>Quản Lý Chương Trình Khuyến Mãi</span>
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Theo dõi các quy tắc mã giảm giá và voucher áp dụng khi xem trước đơn hàng.
        </p>
      </div>

      {/* Notice Banner */}
      <div className="p-4 rounded-2xl border border-amber-200 bg-amber-50/80 text-xs text-amber-900 space-y-1 shadow-xs">
        <div className="flex items-center gap-2 font-bold text-amber-950">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
          <span>Thông báo năng lực backend</span>
        </div>
        <p className="text-[11px] leading-relaxed text-amber-800">
          Chức năng tạo mới và quản trị mã khuyến mãi động chưa có endpoint hỗ trợ trong Core API. Hệ thống hiện áp dụng quy tắc giảm giá tĩnh (như <code>MWG_VIP500</code>) được kiểm tra trực tiếp trong logic tính giá của Core API.
        </p>
      </div>

      {/* System Promotions Cards */}
      <div className="space-y-4">
        <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
          Mã khuyến mãi mặc định hệ thống
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {SYSTEM_DEFAULT_PROMOTIONS.map((promo) => (
            <div
              key={promo.code}
              className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-extrabold bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1 rounded-xl">
                  {promo.code}
                </span>
                <span className="ts-badge-success text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                  Đang hoạt động trong Core
                </span>
              </div>

              <p className="text-xs font-semibold text-slate-800">{promo.description}</p>

              <div className="space-y-1.5 text-xs text-slate-600 pt-2 border-t border-slate-100">
                <div className="flex justify-between">
                  <span>Mức giảm:</span>
                  <span className="font-bold text-emerald-600">{promo.discountAmount}</span>
                </div>
                <div className="flex justify-between">
                  <span>Giá trị đơn tối thiểu:</span>
                  <span className="font-semibold text-slate-800">{promo.minOrder}</span>
                </div>
                <div className="flex justify-between">
                  <span>Phạm vi hỗ trợ:</span>
                  <span className="text-[11px] text-slate-500">{promo.scope}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </BrandSectionBackground>
  );
}
