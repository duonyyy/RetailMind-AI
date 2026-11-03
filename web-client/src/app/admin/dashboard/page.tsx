'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { BrandSectionBackground } from '@/components/patterns';
import { apiFetch } from '@/lib/api-client';
import { formatVND } from '@/lib/utils';
import {
  LayoutDashboard,
  TrendingUp,
  ShoppingBag,
  ShieldAlert,
  ArrowRight,
  Database,
  RefreshCw,
} from 'lucide-react';

interface RecentOrder {
  orderNo: string;
  customer: string;
  product: string;
  store: string;
  total: string;
  status: string;
}

export default function AdminDashboardPage() {
  const [orders, setOrders] = useState<RecentOrder[]>([]);
  const [totalRevenueBig, setTotalRevenueBig] = useState<bigint>(BigInt(0));
  const [orderCount, setOrderCount] = useState<number>(0);
  const [loadError, setLoadError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const fetchDashboardData = async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const res = await apiFetch<any>('admin/orders', { retries: 1 });
      if (res.success && res.data) {
        const rawList = res.data?.orders || (Array.isArray(res.data) ? res.data : []);
        setOrderCount(res.data.total ?? rawList.length);

        let rev = BigInt(0);
        const mapped: RecentOrder[] = rawList.map((o: any) => {
          const t = BigInt(String(o.totalVnd || '0').replace(/\D/g, '') || '0');
          rev += t;
          return {
            orderNo: o.orderNo || o.order_no,
            customer: o.customerName || (o.customerId ? `Khách #${o.customerId.slice(0, 6)}` : 'Khách hàng'),
            product: o.items?.[0]?.name || o.items?.[0]?.title_snapshot || 'Laptop MWG',
            store: o.storeId ? o.storeId.slice(0, 8) : 'MWG_HCM',
            total: o.formattedTotal || formatVND(o.totalVnd || '0'),
            status: String(o.status || 'placed').toUpperCase(),
          };
        });

        setOrders(mapped);
        setTotalRevenueBig(rev);
        return;
      }
    } catch {
      // Fallback
    } finally {
      setIsLoading(false);
    }

    setLoadError('Không thể tải dữ liệu từ Core. Vui lòng thử lại.');
    setOrders([]);
    setTotalRevenueBig(BigInt(0));
    setOrderCount(0);
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const kpis = [
    {
      label: 'Giá trị đơn trong trang hiện tại',
      value: formatVND(totalRevenueBig),
      sub: 'Không bao gồm các trang đơn hàng khác',
      color: 'text-blue-600',
    },
    {
      label: 'Tổng Đơn Hàng Toàn Sàn',
      value: `${orderCount} đơn`,
      sub: 'Khóa tồn bi quan SELECT FOR UPDATE',
      color: 'text-emerald-600',
    },
    {
      label: 'Chi Phí Token AI (FinOps)',
      value: 'Chưa đo',
      sub: 'Chưa có báo cáo đo thực tế',
      color: 'text-amber-600',
    },
    {
      label: 'Tỷ Lệ Trả Lời Đúng (Grounding)',
      value: 'Chưa đánh giá',
      sub: 'Cần bộ đánh giá và kết quả xác minh',
      color: 'text-blue-700',
    },
  ];

  const topProducts: Array<{sku: string; name: string; sold: number; share: number}> = [];

  return (
    <BrandSectionBackground
      variant="soft-blue"
      pattern="dot"
      patternOpacity={0.05}
      withGlow={true}
      className="min-h-full p-6 sm:p-8 space-y-6"
    >
      {loadError && <p role="alert" className="text-red-700">{loadError}</p>}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <LayoutDashboard className="w-5 h-5 text-blue-600" />
            <span>Bảng Điều Khiển Tổng Quan Sàn Bán Lẻ</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-blue-600" />
            <span>
              Giám sát thời gian thực số lượng đơn hàng, doanh thu và hoạt động hệ thống từ Core API.
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchDashboardData()}
            disabled={isLoading}
            className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-bold inline-flex items-center gap-1.5 shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Làm Mới KPI</span>
          </button>
          <Link
            href="/admin/hitl"
            className="px-3.5 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold inline-flex items-center gap-1.5"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
            <span>Tác Vụ HITL</span>
          </Link>
        </div>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k, idx) => (
          <div key={idx} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
            <span className="text-xs font-bold text-slate-400 block">{k.label}</span>
            <span className={`text-2xl font-extrabold tabular-nums block ${k.color}`}>{k.value}</span>
            <span className="text-[11px] text-slate-500 block pt-1">{k.sub}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 7 Cols: Real-time Order Activity */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-blue-600" />
              <span>Hoạt Động Đơn Hàng Gần Đây</span>
            </h2>
            <Link
              href="/admin/orders"
              className="text-xs font-bold text-blue-600 hover:underline inline-flex items-center gap-1"
            >
              <span>Quản lý OMS</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase">
                <tr>
                  <th className="py-3 px-4">Mã Đơn</th>
                  <th className="py-3 px-4">Khách Hàng</th>
                  <th className="py-3 px-4">Sản Phẩm</th>
                  <th className="py-3 px-4">Tổng Tiền</th>
                  <th className="py-3 px-4 text-center">Trạng Thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {!isLoading && orders.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      Chưa có đơn hàng nào được ghi nhận.
                    </td>
                  </tr>
                )}
                {orders.map((ord) => (
                  <tr key={ord.orderNo} className="hover:bg-slate-50/80">
                    <td className="py-3.5 px-4 font-mono font-bold text-blue-600">{ord.orderNo}</td>
                    <td className="py-3.5 px-4 font-semibold text-slate-900">{ord.customer}</td>
                    <td className="py-3.5 px-4 text-slate-600">{ord.product}</td>
                    <td className="py-3.5 px-4 font-bold text-slate-900 tabular-nums">{ord.total}</td>
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          ord.status === 'COMPLETED' ? 'ts-badge-success' : 'ts-badge-warning'
                        }`}
                      >
                        {ord.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right 5 Cols: Top Selling Laptops */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <span>Top Laptop Bán Chạy Trong Ngày</span>
            </h2>
            <Link href="/admin/products" className="text-xs font-bold text-blue-600 hover:underline">
              Mở PIM Hub
            </Link>
          </div>

          <div className="space-y-3.5 text-xs">
            {topProducts.length === 0 && (
              <p className="text-xs text-slate-400 py-8 text-center">
                Chưa có dữ liệu thống kê sản phẩm bán chạy.
              </p>
            )}
            {topProducts.map((tp) => (
              <div key={tp.sku} className="space-y-1">
                <div className="flex justify-between">
                  <span className="font-bold text-slate-800">{tp.name}</span>
                  <span className="font-mono font-bold text-blue-600 tabular-nums">
                    {tp.sold} máy
                  </span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-blue-600 to-cyan-500 h-full rounded-full"
                    style={{ width: `${tp.share}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </BrandSectionBackground>
  );
}
