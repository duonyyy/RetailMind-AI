'use client';

import React, { useState, useEffect } from 'react';
import { BrandSectionBackground } from '@/components/patterns';
import { apiFetch } from '@/lib/api-client';
import { formatVND } from '@/lib/utils';
import {
  ShoppingBag,
  Search,
  CheckCircle2,
  ShieldCheck,
  RefreshCw,
  Database,
  Truck,
} from 'lucide-react';

interface AdminOrderRow {
  orderId: string;
  orderNo: string;
  customerName: string;
  phoneMasked: string;
  sku: string;
  productName: string;
  branchCode: string;
  totalFormatted: string;
  idempotencyKey: string;
  status: 'PLACED' | 'CONFIRMED' | 'SHIPPING' | 'COMPLETED' | 'CANCELLED';
  createdAt: string;
}

const STORE_MAP: Record<string, string> = {
  '10000000-0000-0000-0000-000000000001': 'HCM_001',
  '10000000-0000-0000-0000-000000000002': 'HN_002',
  '10000000-0000-0000-0000-000000000003': 'DN_003',
};

export default function AdminOrdersOmsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [orders, setOrders] = useState<AdminOrderRow[]>([]);
  const [loadError, setLoadError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const fetchOrders = async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const res = await apiFetch<any>('admin/orders', { retries: 1 });
      if (res.success && res.data) {
        const rawList = res.data?.orders || (Array.isArray(res.data) ? res.data : []);
        if (Array.isArray(rawList)) {
          const mapped: AdminOrderRow[] = rawList.map((o: any) => {
            const firstItem = o.items?.[0];
            const rawStatus = String(o.status || 'placed').toUpperCase();
            const status: AdminOrderRow['status'] =
              rawStatus === 'COMPLETED'
                ? 'COMPLETED'
                : rawStatus === 'CANCELLED'
                ? 'CANCELLED'
                : rawStatus === 'SHIPPING'
                ? 'SHIPPING'
                : rawStatus === 'CONFIRMED'
                ? 'CONFIRMED'
                : 'PLACED';

            return {
              orderId: o.orderId || o.id,
              orderNo: o.orderNo || o.order_no,
              customerName: o.customerName || (o.customerId ? `Khách hàng #${o.customerId.slice(0, 8)}` : 'Chưa có thông tin'),
              phoneMasked: 'Chưa có thông tin',
              sku: firstItem?.sku || firstItem?.sku_snapshot || 'Chưa có thông tin',
              productName: firstItem?.name || firstItem?.title_snapshot || 'Laptop Chính Hãng',
              branchCode: STORE_MAP[o.storeId] || o.storeId || 'MWG_HCM_001',
              totalFormatted: o.formattedTotal || formatVND(o.totalVnd || '0'),
              idempotencyKey: o.idempotencyKey || 'Chưa có thông tin',
              status,
              createdAt: new Date(o.confirmedAt || o.created_at || Date.now()).toLocaleString('vi-VN'),
            };
          });
          setOrders(mapped);
          return;
        }
      }
    } catch {
      // Fallback
    } finally {
      setIsLoading(false);
    }

    setLoadError('Không thể tải dữ liệu từ Core API. Vui lòng thử lại.');
    setOrders([]);
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const filtered = orders.filter(
    (o) =>
      !searchTerm ||
      o.orderNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.idempotencyKey.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <BrandSectionBackground
      variant="soft-blue"
      pattern="dot"
      patternOpacity={0.05}
      withGlow={true}
      className="min-h-full p-6 sm:p-8 space-y-6"
    >
      {loadError && (
        <div role="alert" className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-800">
          {loadError}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-blue-600" />
            <span>Quản Lý Đơn Hàng (OMS Hub)</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-blue-600" />
            <span>
              Theo dõi đối soát khóa chống trùng lặp Idempotency-Key và danh sách đơn hàng toàn sàn từ Core API.
            </span>
          </p>
        </div>

        <button
          onClick={() => fetchOrders()}
          disabled={isLoading}
          className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-bold inline-flex items-center gap-1.5 shadow-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Làm Mới Đơn Hàng</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between gap-3">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo Mã đơn, Tên khách hàng, hoặc Idempotency-Key..."
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
          />
        </div>
        <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
          <ShieldCheck className="w-4 h-4" /> Bảo vệ tồn kho khả dụng
        </span>
      </div>

      {/* OMS Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase">
              <tr>
                <th className="py-3.5 px-4">Mã Đơn &amp; Thời Gian</th>
                <th className="py-3.5 px-4">Khách Hàng</th>
                <th className="py-3.5 px-4">Sản Phẩm &amp; Kho Xuất</th>
                <th className="py-3.5 px-4">Idempotency Key</th>
                <th className="py-3.5 px-4">Tổng Tiền</th>
                <th className="py-3.5 px-4 text-center">Trạng Thái</th>
                <th className="py-3.5 px-4 text-right">Điều Phối</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    Chưa có đơn hàng nào phù hợp với bộ lọc tìm kiếm.
                  </td>
                </tr>
              )}
              {filtered.map((ord) => (
                <tr key={ord.orderNo} className="hover:bg-slate-50/80">
                  <td className="py-3.5 px-4">
                    <div className="font-mono font-bold text-blue-600">{ord.orderNo}</div>
                    <div className="text-[11px] text-slate-400">{ord.createdAt}</div>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="font-bold text-slate-900">{ord.customerName}</div>
                    <div className="font-mono text-[11px] text-slate-400">{ord.phoneMasked}</div>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-slate-800">{ord.productName}</div>
                    <div className="text-[11px] text-blue-700 font-mono">Kho: {ord.branchCode}</div>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500">
                    {ord.idempotencyKey}
                  </td>
                  <td className="py-3.5 px-4 font-extrabold text-slate-900 tabular-nums">
                    {ord.totalFormatted}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        ord.status === 'COMPLETED'
                          ? 'ts-badge-success'
                          : ord.status === 'CANCELLED'
                          ? 'ts-badge-danger'
                          : 'ts-badge-warning'
                      }`}
                    >
                      {ord.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right whitespace-nowrap">
                    {ord.status === 'COMPLETED' ? (
                      <span className="text-emerald-700 font-bold inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Đã tất toán</span>
                      </span>
                    ) : ord.status === 'CANCELLED' ? (
                      <span className="text-rose-600 font-bold inline-flex items-center gap-1">
                        <span>Đã hủy đơn</span>
                      </span>
                    ) : (
                      <span
                        className="text-[11px] text-slate-400 italic font-medium"
                        title="Core API hiện chưa hỗ trợ endpoint chuyển trạng thái vận chuyển"
                      >
                        Chuyển trạng thái: Chưa hỗ trợ
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </BrandSectionBackground>
  );
}
