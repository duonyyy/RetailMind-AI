'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { BrandSectionBackground } from '@/components/patterns';
import { useCurrentUser } from '@/features/auth/useCurrentUser';
import { ScreenLoading } from '@/components/commons/ScreenLoading';
import {
  UserCheck,
  ShieldCheck,
  Download,
  MapPin,
  Lock,
  LogIn,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';

export default function ProfilePrivacyPage() {
  const { user, isLoading } = useCurrentUser();
  const [exportedJson, setExportedJson] = useState<string | null>(null);

  if (isLoading) {
    return <ScreenLoading message="Đang tải thông tin hồ sơ..." />;
  }

  if (!user) {
    return (
      <BrandSectionBackground
        variant="soft-blue"
        pattern="dot"
        patternOpacity={0.05}
        withGlow={true}
        className="min-h-full p-6 sm:p-8 flex items-center justify-center"
      >
        <div className="bg-white rounded-2xl border border-slate-200 p-8 max-w-md w-full text-center shadow-xs space-y-4">
          <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 mx-auto flex items-center justify-center">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-slate-900">Yêu cầu đăng nhập</h2>
          <p className="text-xs text-slate-500">
            Quý khách vui lòng đăng nhập tài khoản để xem thông tin hồ sơ và thực hiện các quyền riêng tư dữ liệu cá nhân.
          </p>
          <Link
            href="/login"
            className="ts-cta text-xs py-2.5 px-6 inline-flex items-center gap-2 justify-center w-full"
          >
            <LogIn className="w-4 h-4" />
            <span>Đăng nhập ngay</span>
          </Link>
        </div>
      </BrandSectionBackground>
    );
  }

  const handleExportData = () => {
    const portableData = {
      compliance: 'Nghị định 13/2023/NĐ-CP và Luật Bảo vệ dữ liệu cá nhân',
      exportedAt: new Date().toISOString(),
      account: {
        id: user.id,
        fullName: user.fullName || 'Chưa cập nhật',
        email: user.email,
        phone: user.phone || 'Chưa cập nhật',
        role: user.role,
      },
      privacyNotice: 'Thông tin nhạy cảm định danh (CCCD, SĐT) được hệ thống che giấu/làm sạch tự động trước khi gửi tới mô hình AI.',
    };
    setExportedJson(JSON.stringify(portableData, null, 2));
  };

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
          <UserCheck className="w-5 h-5 text-blue-600" />
          <span>Hồ Sơ Cá Nhân &amp; Quyền Riêng Tư Dữ Liệu</span>
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Quản lý thông tin định danh và thực thi quyền chủ thể dữ liệu cá nhân theo quy định của pháp luật.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Personal Info */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Lock className="w-4 h-4 text-blue-600" />
              <span>Thông Tin Định Danh Khách Hàng</span>
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
              {user.role}
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500">Mã khách hàng:</span>
              <span className="font-mono font-bold text-slate-800">{user.id}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500">Họ và tên:</span>
              <span className="font-bold text-slate-900">{user.fullName || 'Chưa cập nhật'}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500">Email:</span>
              <span className="font-mono font-semibold text-slate-800">{user.email}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500">Số điện thoại:</span>
              <span className="font-mono font-semibold text-slate-800">
                {user.phone ? user.phone : 'Chưa cập nhật'}
              </span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-slate-500">Bảo vệ định danh PII:</span>
              <span className="text-emerald-700 font-semibold">Tự động làm sạch trước khi gửi LLM</span>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 space-y-2">
            <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-blue-600" />
              <span>Sổ Địa Chỉ Giao Hàng:</span>
            </h3>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600">
              Địa chỉ giao nhận được nhập trực tiếp khi thực hiện thanh toán đơn hàng.
            </div>
          </div>
        </div>

        {/* Right: Data Subject Rights */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Quyền Của Chủ Thể Dữ Liệu</span>
          </h2>

          <div className="space-y-3 text-xs">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
              <div className="font-bold text-slate-900">
                1. Quyền Trích Xuất Dữ Liệu (Data Portability)
              </div>
              <p className="text-slate-600">
                Trích xuất hồ sơ tài khoản và dữ liệu cá nhân theo định dạng JSON chuẩn.
              </p>
              <button
                type="button"
                onClick={handleExportData}
                className="ts-cta py-2 px-4 text-xs font-bold inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Trích xuất dữ liệu cá nhân (JSON)</span>
              </button>
            </div>

            {exportedJson && (
              <pre className="p-3 rounded-xl bg-slate-900 text-emerald-300 font-mono text-[10px] overflow-x-auto max-h-40">
                {exportedJson}
              </pre>
            )}

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
              <div className="font-bold text-slate-900">
                2. Yêu Cầu Xóa Hoặc Ẩn Danh Hóa Dữ Liệu
              </div>
              <p className="text-slate-600">
                Để yêu cầu xóa tài khoản, ẩn danh hóa dữ liệu hội thoại hoặc khiếu nại liên quan tới quyền riêng tư, quý khách vui lòng tạo phiếu hỗ trợ qua kênh CSKH.
              </p>
              <Link
                href="/support"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold transition"
              >
                <HelpCircle className="w-3.5 h-3.5 text-blue-600" />
                <span>Gửi yêu cầu tới Trung tâm Hỗ trợ</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </BrandSectionBackground>
  );
}
