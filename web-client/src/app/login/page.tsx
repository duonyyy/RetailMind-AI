'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { BrandSectionBackground } from '@/components/patterns';
import {
  ShieldCheck,
  Lock,
  Mail,
  Eye,
  EyeOff,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  UserCheck,
} from 'lucide-react';

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('customer@mwg-retailmind.vn');
  const [password, setPassword] = useState('RetailMind@2026');
  const [selectedRole, setSelectedRole] = useState<'customer' | 'admin'>('customer');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!identifier.trim() || !password.trim()) {
      setErrorMsg('Vui lòng nhập đầy đủ Email/Số điện thoại và mật khẩu.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/proxy/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: identifier.trim(),
          password,
        }),
      });

      if (!res.ok) {
        setErrorMsg('Đăng nhập thất bại. Vui lòng kiểm tra thông tin và thử lại.');
        return;
      }
      const body = await res.json();
      const userObj = body?.data?.user || body?.user;
      const role = String(userObj?.role || '').toLowerCase();
      setSuccessMsg('Đăng nhập thành công.');
      window.location.href = role === 'admin' ? '/admin/dashboard' : '/';
    } catch {
      setErrorMsg('Không thể kết nối dịch vụ đăng nhập.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <BrandSectionBackground
      variant="soft-blue"
      pattern="ribbon"
      patternOpacity={0.07}
      withGlow={true}
      className="min-h-full p-6 sm:p-10 flex items-center justify-center"
    >
      <div className="w-full max-w-md bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200 p-7 shadow-xl space-y-6">
        <div className="text-center space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-bold">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>SCR-01 • Cổng Xác Thực Argon2id &amp; HttpOnly Cookie</span>
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Đăng Nhập RetailMind AI
          </h1>
          <p className="text-xs text-slate-500">
            Bảo mật tuyệt đối phiên giao dịch theo chuẩn Zero-XSS (ADR-009).
          </p>
        </div>

        {/* Persona Selector */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl text-xs font-bold">
          <button
            type="button"
            onClick={() => {
              setSelectedRole('customer');
              setIdentifier('customer@mwg-retailmind.vn');
            }}
            className={`py-2 rounded-lg transition ${
              selectedRole === 'customer'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Khách hàng (Customer)
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedRole('admin');
              setIdentifier('admin@mwg-retailmind.vn');
            }}
            className={`py-2 rounded-lg transition ${
              selectedRole === 'admin'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Quản trị viên (Admin)
          </button>
        </div>

        {errorMsg && (
          <div className="ts-badge-danger p-3 rounded-xl text-xs font-medium flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="ts-badge-success p-3 rounded-xl text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">
              Email hoặc Số điện thoại (Chuẩn vi-VN):
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="customer@mwg-retailmind.vn hoặc 0908123456"
                required
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700">Mật khẩu:</label>
              <Link href="/forgot" className="text-[11px] font-semibold text-blue-600 hover:underline">
                Quên mật khẩu?
              </Link>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                aria-label="Hiện/Ẩn mật khẩu"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs">
            <label className="flex items-center gap-2 text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="rounded text-blue-600 focus:ring-0"
              />
              <span>Ghi nhớ phiên (Refresh Token 7 ngày)</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="ts-cta w-full py-3 text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Đang xác thực an toàn...</span>
              </>
            ) : (
              <>
                <UserCheck className="w-4 h-4" />
                <span>Đăng Nhập An Toàn</span>
              </>
            )}
          </button>
        </form>

        <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>Chưa có tài khoản khách hàng?</span>
          <Link
            href="/register"
            className="font-bold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
          >
            <span>Đăng ký ngay</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </BrandSectionBackground>
  );
}
