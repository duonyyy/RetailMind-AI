'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShoppingCart, UserRound, LogOut, Shield } from 'lucide-react';
import { useCurrentUser } from '@/features/auth/useCurrentUser';

export function TopBar() {
  const pathname = usePathname();
  const { user, isLoading, logout } = useCurrentUser();

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-8">
      <div>
        <p className="text-sm font-bold text-slate-900">
          {pathname.startsWith('/admin') ? 'Không gian quản trị' : 'Chào mừng đến với RetailMind'}
        </p>
        <p className="hidden text-xs text-slate-500 sm:block">
          Khám phá và chọn thiết bị phù hợp với bạn
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Link
          href="/cart"
          aria-label="Giỏ hàng"
          className="rounded-xl p-2.5 text-slate-600 hover:bg-slate-100 transition"
        >
          <ShoppingCart className="h-5 w-5" />
        </Link>

        {!isLoading && user ? (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <span className="font-semibold text-slate-800">{user.fullName || user.email}</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase ${
                  user.role === 'ADMIN'
                    ? 'bg-rose-100 text-rose-700 border border-rose-200'
                    : 'bg-blue-100 text-blue-700 border border-blue-200'
                }`}
              >
                {user.role}
              </span>
            </div>

            {user.role === 'ADMIN' && (
              <Link
                href="/admin/dashboard"
                className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                <Shield className="h-3.5 w-3.5 text-rose-600" />
                <span>Admin Hub</span>
              </Link>
            )}

            <button
              onClick={() => logout()}
              title="Đăng xuất"
              className="rounded-xl p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition"
              aria-label="Đăng xuất"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            <UserRound className="h-4 w-4" />
            <span>Đăng nhập</span>
          </Link>
        )}
      </div>
    </header>
  );
}
