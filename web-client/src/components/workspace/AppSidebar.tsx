'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  BookOpen,
  Boxes,
  ClipboardList,
  Headphones,
  Home,
  LayoutDashboard,
  Laptop,
  Menu,
  Package,
  Scale,
  Settings,
  Shield,
  ShoppingCart,
  Tags,
  User,
  Warehouse,
  X,
} from 'lucide-react';
import { useCurrentUser } from '@/features/auth/useCurrentUser';

const customerItems = [
  { label: 'Trang chủ', href: '/', icon: Home },
  { label: 'Danh mục laptop', href: '/catalog', icon: Laptop },
  { label: 'So sánh sản phẩm', href: '/compare', icon: Scale },
  { label: 'Giỏ hàng', href: '/cart', icon: ShoppingCart },
  { label: 'Đơn hàng của tôi', href: '/orders', icon: Package },
  { label: 'Bảo hành điện tử', href: '/warranty', icon: Shield },
  { label: 'Hỗ trợ kỹ thuật', href: '/support', icon: Headphones },
  { label: 'Hồ sơ cá nhân', href: '/profile', icon: User },
];

const adminItems = [
  { label: 'Tổng quan sàn', href: '/admin/dashboard', icon: LayoutDashboard },
  { label: 'Quản lý sản phẩm', href: '/admin/products', icon: Boxes },
  { label: 'Tồn kho chi nhánh', href: '/admin/inventory', icon: Warehouse },
  { label: 'Quản lý đơn hàng (OMS)', href: '/admin/orders', icon: Package },
  { label: 'Phê duyệt HITL', href: '/admin/hitl', icon: Shield },
  { label: 'Quản trị tri thức RAG', href: '/admin/knowledge', icon: BookOpen },
  { label: 'Chương trình khuyến mãi', href: '/admin/promotions', icon: Tags },
  { label: 'Giám sát hạ tầng & FinOps', href: '/admin/observability', icon: Activity },
  { label: 'Nhật ký kiểm toán', href: '/admin/audit-logs', icon: ClipboardList },
  { label: 'Mạng lưới siêu thị', href: '/admin/stores', icon: Warehouse },
  { label: 'Cấu hình tự phục hồi', href: '/admin/settings', icon: Settings },
];

export function AppSidebar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { user } = useCurrentUser();
  const isAdmin = user?.role === 'ADMIN';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Mở menu điều hướng"
        aria-expanded={open}
        className="fixed bottom-5 right-5 z-30 rounded-full bg-blue-600 p-4 text-white shadow-xl hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open && (
        <button
          type="button"
          aria-label="Đóng menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs md:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform duration-200 md:sticky md:top-0 md:h-screen md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 shrink-0 items-center justify-between px-6 border-b border-slate-100">
          <Link
            href="/"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-base font-black text-white shadow-xs">
              R
            </span>
            <span>
              <span className="block text-base font-extrabold tracking-tight text-slate-900">
                RetailMind<span className="text-blue-600">.</span>
              </span>
              <span className="block text-[9px] font-bold uppercase tracking-widest text-slate-400">
                AI Shopping Platform
              </span>
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 md:hidden"
            aria-label="Đóng menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav aria-label="Điều hướng chính" className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
          <div>
            <p className="px-3 pb-2 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
              Mua sắm
            </p>
            <div className="space-y-1">
              {customerItems.map(({ label, href, icon: Icon }) => {
                const active = href === '/' ? pathname === href : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                      active
                        ? 'bg-blue-50 text-blue-700 font-bold'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-blue-600' : 'text-slate-400'}`} />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          {isAdmin && (
            <div>
              <p className="px-3 pb-2 text-[10px] font-extrabold uppercase tracking-widest text-rose-500">
                Quản trị sàn (Admin)
              </p>
              <div className="space-y-1">
                {adminItems.map(({ label, href, icon: Icon }) => {
                  const active = pathname.startsWith(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setOpen(false)}
                      aria-current={active ? 'page' : undefined}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                        active
                          ? 'bg-rose-50 text-rose-700 font-bold'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-rose-600' : 'text-slate-400'}`} />
                      <span>{label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </nav>

        <div className="border-t border-slate-100 p-4">
          <Link
            href="/status"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 hover:text-blue-600 transition"
          >
            <Activity className="h-4 w-4 text-emerald-600" />
            <span>Trạng thái dịch vụ</span>
          </Link>
        </div>
      </aside>
    </>
  );
}
