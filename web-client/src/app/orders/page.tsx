'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { BrandSectionBackground } from '@/components/patterns';
import { apiFetch } from '@/lib/api-client';
import { formatVND } from '@/lib/utils';
import {
  PackageCheck,
  Search,
  CheckCircle2,
  XCircle,
  FileText,
  ShieldCheck,
  RefreshCw,
  Database,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';

interface OrderRecord {
  orderId: string;
  orderNo: string;
  productName: string;
  sku: string;
  branch: string;
  totalAmount: string;
  status: 'PLACED' | 'CONFIRMED' | 'PACKING' | 'SHIPPING' | 'COMPLETED' | 'CANCELLED';
  stepIndex: number; // 0 to 5
  orderDate: string;
  warrantyUntil: string;
  returnEligibleUntil: string;
}

const ORDER_STEPS = [
  '1. Đã đặt hàng',
  '2. Đã giữ kho',
  '3. Đang đóng gói',
  '4. Đang giao hàng',
  '5. Hoàn tất',
];

const STORE_MAP: Record<string, string> = {
  '10000000-0000-0000-0000-000000000001': '136 Nguyễn Thái Học, Q.1, TP.HCM',
  '10000000-0000-0000-0000-000000000002': '117 Thái Hà, Đống Đa, Hà Nội',
  '10000000-0000-0000-0000-000000000003': '320 đường 2/9, Hải Châu, Đà Nẵng',
};

export default function OrdersPage() {
  const [orderQuery, setOrderQuery] = useState('');
  const [statusTab, setStatusTab] = useState('ALL');
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [cancellingNo, setCancellingNo] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchOrders = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch<any>('orders', { retries: 1 });
      if (res.success && res.data) {
        const rawList = res.data?.orders || (Array.isArray(res.data) ? res.data : []);
        const mapped: OrderRecord[] = rawList.map((o: any) => {
          const rawStatus = String(o.status || 'placed').toLowerCase();
          let status: OrderRecord['status'] = 'CONFIRMED';
          let stepIndex = 2;

          if (rawStatus === 'completed') {
            status = 'COMPLETED';
            stepIndex = 5;
          } else if (rawStatus === 'shipping') {
            status = 'SHIPPING';
            stepIndex = 4;
          } else if (rawStatus === 'packing') {
            status = 'PACKING';
            stepIndex = 3;
          } else if (rawStatus === 'cancelled') {
            status = 'CANCELLED';
            stepIndex = 0;
          } else {
            status = 'CONFIRMED';
            stepIndex = 2;
          }

          const createdDate = new Date(o.confirmedAt || o.created_at || Date.now());
          const warrantyDate = new Date(createdDate);
          warrantyDate.setFullYear(warrantyDate.getFullYear() + 2);
          const returnDate = new Date(createdDate);
          returnDate.setDate(returnDate.getDate() + 30);

          const firstItem = o.items?.[0];

          return {
            orderId: o.orderId || o.id,
            orderNo: o.orderNo || o.order_no,
            productName: firstItem?.name || firstItem?.title_snapshot || 'Laptop MWG Chính Hãng',
            sku: firstItem?.sku || firstItem?.sku_snapshot || 'MWG-LAPTOP',
            branch: STORE_MAP[o.storeId] || o.storeId || '136 Nguyễn Thái Học, Q.1, TP.HCM',
            totalAmount: o.formattedTotal || formatVND(o.totalVnd || '0'),
            status,
            stepIndex,
            orderDate: createdDate.toLocaleString('vi-VN'),
            warrantyUntil: warrantyDate.toISOString().slice(0, 10),
            returnEligibleUntil: `${returnDate.toISOString().slice(0, 10)} (Đổi mới 30 ngày)`,
          };
        });
        setOrders(mapped);
      }
    } catch {
      // Ignored
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const handleCancelOrder = async (orderId: string, orderNo: string) => {
    if (!confirm(`Quý khách có chắc chắn muốn hủy đơn hàng ${orderNo}? Hệ thống sẽ giải phóng tồn kho ngay lập tức.`)) {
      return;
    }
    setCancellingNo(orderNo);
    setActionMessage(null);
    try {
      const res = await apiFetch(`orders/${orderId || orderNo}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Khách hàng yêu cầu hủy đơn trên Web Client' }),
      });

      if (!res.success) {
        throw new Error(res.error?.message || 'Không thể hủy đơn hàng.');
      }

      setActionMessage({
        text: `Đã hủy thành công đơn hàng ${orderNo}. Tồn kho đã được hoàn về siêu thị.`,
        type: 'success',
      });
      await fetchOrders();
    } catch (err) {
      setActionMessage({
        text: err instanceof Error ? err.message : 'Lỗi khi hủy đơn hàng.',
        type: 'error',
      });
    } finally {
      setCancellingNo(null);
    }
  };

  const filtered = orders.filter((o) => {
    if (statusTab !== 'ALL' && o.status !== statusTab) return false;
    if (
      orderQuery &&
      !o.orderNo.toLowerCase().includes(orderQuery.toLowerCase()) &&
      !o.productName.toLowerCase().includes(orderQuery.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  return (
    <BrandSectionBackground
      variant="soft-blue"
      pattern="dot"
      patternOpacity={0.05}
      withGlow={true}
      className="min-h-full p-6 sm:p-8 space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <PackageCheck className="w-5 h-5 text-blue-600" />
            <span>Lịch Sử Đơn Hàng &amp; Theo Dõi Vận Chuyển 5 Bước (SCR-10 • UC04)</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-blue-600" />
            <span>
              Dữ liệu trực tiếp từ PostgreSQL 16+ (Chống IDOR). Hủy đơn thực thi ACID hoàn kho tức thì.
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchOrders()}
            disabled={isLoading}
            className="px-3 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-bold inline-flex items-center gap-1.5 shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>
          <Link
            href="/warranty"
            className="px-3.5 py-2 rounded-xl bg-white border border-blue-200 text-blue-700 text-xs font-bold inline-flex items-center gap-1.5 shadow-xs"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Cổng Bảo Hành 30 Ngày</span>
          </Link>
        </div>
      </div>

      {actionMessage && (
        <div
          role="alert"
          className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {actionMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          )}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* Tabs & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 flex-wrap text-xs font-semibold">
            {[
              { id: 'ALL', label: 'Tất cả' },
              { id: 'CONFIRMED', label: 'Đã giữ kho' },
              { id: 'SHIPPING', label: 'Đang giao' },
              { id: 'COMPLETED', label: 'Hoàn tất' },
              { id: 'CANCELLED', label: 'Đã hủy' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setStatusTab(t.id)}
                className={`px-3 py-1.5 rounded-lg transition ${
                  statusTab === t.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={orderQuery}
              onChange={(e) => setOrderQuery(e.target.value)}
              placeholder="Tìm theo mã đơn MWG-..."
              className="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Orders List with 5-Step Stepper */}
      <div className="space-y-4">
        {isLoading && orders.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-600 mx-auto" />
            <p className="text-xs text-slate-500">Đang tải lịch sử đơn hàng từ PostgreSQL SSOT...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
            <PackageCheck className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="text-sm font-bold text-slate-800">Chưa có đơn hàng nào</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Quý khách chưa có đơn hàng nào trong hệ thống. Hãy chọn mẫu laptop ưng ý và đặt hàng ngay hôm nay.
            </p>
            <Link href="/catalog" className="ts-cta text-xs py-2 px-4 inline-flex items-center gap-1.5 mt-2">
              <span>Khám phá danh mục Laptop</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        ) : (
          filtered.map((ord) => (
            <div key={ord.orderNo} className="ts-feature-card p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-bold text-blue-600">
                    {ord.orderNo}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                      ord.status === 'COMPLETED'
                        ? 'ts-badge-success'
                        : ord.status === 'CANCELLED'
                        ? 'ts-badge-danger'
                        : 'ts-badge-warning'
                    }`}
                  >
                    {ord.status === 'COMPLETED'
                      ? 'Đã Giao Thành Công'
                      : ord.status === 'CANCELLED'
                      ? 'Đã Hủy & Hoàn Kho'
                      : 'Đã Xác Nhận & Giữ Tồn Kho'}
                  </span>
                </div>
                <span className="text-xs text-slate-400">Ngày đặt: {ord.orderDate}</span>
              </div>

              {/* 5-Step Order Stepper */}
              {ord.status !== 'CANCELLED' && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 py-2">
                  {ORDER_STEPS.map((stepLabel, idx) => {
                    const done = idx + 1 <= ord.stepIndex;
                    return (
                      <div
                        key={stepLabel}
                        className={`p-2.5 rounded-xl border text-[11px] font-semibold flex items-center gap-1.5 ${
                          done
                            ? 'bg-emerald-50/80 border-emerald-200 text-emerald-800'
                            : 'bg-slate-50 border-slate-200 text-slate-400'
                        }`}
                      >
                        <CheckCircle2
                          className={`w-3.5 h-3.5 shrink-0 ${
                            done ? 'text-emerald-600' : 'text-slate-300'
                          }`}
                        />
                        <span className="truncate">{stepLabel}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-400 block mb-0.5">Sản phẩm (Snapshot giá lúc mua):</span>
                  <Link
                    href={`/products/${ord.sku}`}
                    className="font-bold text-slate-900 hover:text-blue-600 text-sm block"
                  >
                    {ord.productName}
                  </Link>
                  <span className="text-slate-400 font-mono text-[11px]">SKU: {ord.sku}</span>
                  <div className="mt-2 text-slate-600">
                    <span className="font-semibold">Chi nhánh phụ trách:</span> {ord.branch}
                  </div>
                </div>

                <div className="space-y-2 bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Tổng thanh toán:</span>
                    <span className="font-extrabold text-blue-600 tabular-nums">{ord.totalAmount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Hạn bảo hành chính hãng:</span>
                    <span className="font-semibold text-emerald-700">{ord.warrantyUntil}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Đổi trả miễn phí 30 ngày:</span>
                    <span className="font-bold text-blue-700">{ord.returnEligibleUntil}</span>
                  </div>
                </div>
              </div>

              {/* Order Action Footer */}
              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-end gap-2.5 text-xs">
                <Link
                  href={`/warranty?orderNo=${ord.orderNo}`}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 font-semibold text-slate-700 inline-flex items-center gap-1.5"
                >
                  <FileText className="w-3.5 h-3.5 text-blue-600" />
                  <span>Hóa đơn VAT &amp; Bảo hành</span>
                </Link>

                {ord.status === 'CONFIRMED' && (
                  <button
                    type="button"
                    disabled={cancellingNo === ord.orderNo}
                    onClick={() => handleCancelOrder(ord.orderId, ord.orderNo)}
                    className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold inline-flex items-center gap-1 disabled:opacity-50"
                  >
                    {cancellingNo === ord.orderNo ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5" />
                    )}
                    <span>Hủy đơn &amp; Hoàn kho (ACID)</span>
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </BrandSectionBackground>
  );
}
