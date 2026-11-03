'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { BrandSectionBackground } from '@/components/patterns';
import { apiFetch } from '@/lib/api-client';
import { formatVND } from '@/lib/utils';
import { ScreenError } from '@/components/commons/ScreenError';
import { ScreenLoading } from '@/components/commons/ScreenLoading';
import { OrderStatusTag } from '@/components/tags/OrderStatusTag';
import {
  CheckCircle2,
  Package,
  Store,
  Clock,
  ArrowRight,
  FileText,
  Printer,
  ShieldCheck,
  ShoppingBag,
} from 'lucide-react';

interface VerifiedOrderItem {
  sku?: string;
  sku_snapshot?: string;
  name?: string;
  title_snapshot?: string;
  quantity?: number;
  unitPriceVnd?: string;
  price_snapshot?: string;
  totalPriceVnd?: string;
}

interface VerifiedOrder {
  id?: string;
  orderId?: string;
  orderNo: string;
  status: string;
  totalVnd: string;
  formattedTotal?: string;
  storeId?: string;
  storeName?: string;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  confirmedAt?: string;
  created_at?: string;
  items?: VerifiedOrderItem[];
}

const STORE_NAME_MAP: Record<string, string> = {
  '10000000-0000-0000-0000-000000000001': 'Thế Giới Di Động 136 Nguyễn Thái Học, Quận 1, TP.HCM',
  '10000000-0000-0000-0000-000000000002': 'Thế Giới Di Động 117 Thái Hà, Đống Đa, Hà Nội',
  '10000000-0000-0000-0000-000000000003': 'Điện Máy Xanh 320 đường 2/9, Hải Châu, Đà Nẵng',
};

function ReceiptContent() {
  const params = useSearchParams();
  const router = useRouter();
  const orderNo = params.get('orderNo');

  const [order, setOrder] = useState<VerifiedOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPaying, setIsPaying] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  async function payOrder() {
    if (!order || isPaying) return;
    setIsPaying(true);
    setPaymentError(null);
    try {
      const keyName = `retailmind.payment.receipt.${order.orderId || order.orderNo}`;
      const key = localStorage.getItem(keyName) || crypto.randomUUID();
      localStorage.setItem(keyName, key);
      const paid = await apiFetch<{ status: string }>(`orders/${encodeURIComponent(order.orderId || order.orderNo)}/simulate-payment`, {
        method: 'POST', idempotencyKey: key, retries: 0,
      });
      if (!paid.success || paid.data?.status !== 'completed') throw new Error(paid.error?.message || 'Chưa xác nhận thanh toán.');
      const receipt = await apiFetch<VerifiedOrder>(`orders/${encodeURIComponent(order.orderNo)}`, { retries: 0 });
      if (!receipt.success || !receipt.data) throw new Error('Đã nhận phản hồi thanh toán; cần tải lại biên nhận để đối soát.');
      setOrder(receipt.data);
      localStorage.removeItem(keyName);
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : 'Không thể xác nhận thanh toán.');
    } finally { setIsPaying(false); }
  }

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);
    setOrder(null);

    if (!orderNo || !orderNo.trim()) {
      setError('Không tìm thấy mã đơn hàng để xác minh biên nhận.');
      setIsLoading(false);
      return;
    }

    apiFetch<VerifiedOrder>(`orders/${encodeURIComponent(orderNo.trim())}`, { retries: 0 })
      .then((res) => {
        if (!active) return;
        if (!res.success || !res.data || !res.data.orderNo) {
          setError(
            res.error?.message ||
              'Chưa xác minh được đơn hàng từ hệ thống. Quý khách vui lòng đăng nhập để kiểm tra lịch sử đơn hàng.'
          );
          return;
        }
        setOrder(res.data);
      })
      .catch(() => {
        if (active) {
          setError('Không thể kết nối đến máy chủ để xác minh đơn hàng. Vui lòng thử lại sau.');
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [orderNo]);

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <ScreenLoading message="Đang xác minh thông tin đơn hàng từ Core API..." />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="max-w-2xl mx-auto py-8">
        <ScreenError
          title="Không thể tải biên nhận"
          message={error || 'Đơn hàng không tồn tại hoặc bạn không có quyền truy cập.'}
          onRetry={() => router.push('/orders')}
        />
        <div className="mt-4 text-center">
          <Link href="/orders" className="text-xs font-semibold text-blue-600 hover:underline">
            ← Đến trang quản lý đơn hàng của bạn
          </Link>
        </div>
      </div>
    );
  }

  const orderTime = order.confirmedAt || order.created_at;
  const formattedTime = orderTime
    ? new Date(orderTime).toLocaleString('vi-VN')
    : 'Vừa hoàn tất';
  const displayStore = order.storeId
    ? order.storeName || `Chi nhánh kho #${order.storeId}`
    : 'Chưa có thông tin kho';
  const items = Array.isArray(order.items) ? order.items : [];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Success Card Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-4 shadow-xs">
        <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Xác Nhận Đơn Hàng Thành Công
          </h1>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {order.status === 'completed' ? 'Core đã xác nhận thanh toán mô phỏng thành công.' : 'Đơn hàng đã được lưu. Trạng thái thanh toán được xác nhận từ Core.'}
          </p>
        </div>

        <div className="inline-flex flex-wrap items-center justify-center gap-3 pt-2">
          <span className="font-mono text-xs font-bold text-slate-700 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200">
            Mã đơn: <strong className="text-blue-600">{order.orderNo}</strong>
          </span>
          <OrderStatusTag status={order.status} />
        </div>
        {paymentError && <p role="alert" className="text-sm text-rose-700">{paymentError}</p>}
        {['placed', 'confirmed', 'pending'].includes(order.status) && <button type="button" onClick={payOrder} disabled={isPaying}
          className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">
          {isPaying ? 'Đang xác nhận...' : 'Thanh toán mô phỏng đơn này'}
        </button>}
      </div>

      {/* Order Details & Summary Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-600" />
            <span>Biên Nhận Điện Tử Đơn Hàng</span>
          </h2>
          <button
            type="button"
            onClick={() => window.print()}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 transition"
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            <span>In biên nhận</span>
          </button>
        </div>

        {/* Store & Time Meta */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="space-y-1 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-slate-400 font-semibold block flex items-center gap-1">
              <Store className="w-3.5 h-3.5 text-blue-600" /> Điểm tiếp nhận / Nhận hàng:
            </span>
            <span className="font-bold text-slate-900 block">{displayStore}</span>
          </div>
          <div className="space-y-1 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-slate-400 font-semibold block flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-blue-600" /> Thời gian xác nhận đơn:
            </span>
            <span className="font-bold text-slate-900 block">{formattedTime}</span>
          </div>
        </div>

        {/* Items Table */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-slate-700">Chi tiết sản phẩm</h3>
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase">
                <tr>
                  <th className="py-2.5 px-4">Sản phẩm</th>
                  <th className="py-2.5 px-4 text-center">SL</th>
                  <th className="py-2.5 px-4 text-right">Đơn giá</th>
                  <th className="py-2.5 px-4 text-right">Thành tiền</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4 px-4 text-center text-slate-500">
                      Đơn hàng đã được xác nhận (Chi tiết sản phẩm đang được cập nhật).
                    </td>
                  </tr>
                ) : (
                  items.map((it, idx) => {
                    const sku = it.sku || it.sku_snapshot || 'Chưa có thông tin';
                    const name = it.name || it.title_snapshot || 'Laptop chính hãng';
                    const qty = it.quantity || 1;
                    const unitPrice = it.unitPriceVnd || it.price_snapshot || '0';
                    const lineTotal = it.totalPriceVnd || String(BigInt(unitPrice) * BigInt(qty));
                    return (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{name}</div>
                          <div className="font-mono text-[11px] text-slate-400">SKU: {sku}</div>
                        </td>
                        <td className="py-3 px-4 text-center font-bold tabular-nums">{qty}</td>
                        <td className="py-3 px-4 text-right tabular-nums text-slate-600">
                          {formatVND(unitPrice)}
                        </td>
                        <td className="py-3 px-4 text-right font-bold tabular-nums text-slate-900">
                          {formatVND(lineTotal)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Total Confirmation from Core */}
        <div className="p-4 rounded-xl bg-blue-50/80 border border-blue-200 flex items-baseline justify-between">
          <div>
            <span className="text-xs font-bold text-blue-900 block">
              Tổng Tiền Thanh Toán (Đã xác nhận)
            </span>
            <span className="text-[11px] text-blue-700">Đã bao gồm thuế giá trị gia tăng (VAT)</span>
          </div>
          <span className="text-xl font-extrabold text-blue-700 tabular-nums">
            {formatVND(order.totalVnd)}
          </span>
        </div>

        {/* Simulated Payment Notice */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 space-y-1">
          <div className="font-bold flex items-center gap-1.5 text-slate-800">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Thông báo môi trường thử nghiệm</span>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Thao tác thanh toán trong ứng dụng mang tính chất thử nghiệm quy trình. Không có giao dịch chuyển khoản ngân hàng thực tế phát sinh.
          </p>
        </div>

        {/* Navigation CTAs */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-end gap-3">
          <Link
            href="/catalog"
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs inline-flex items-center justify-center gap-1.5 transition"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Tiếp tục mua sắm</span>
          </Link>
          <Link
            href="/orders"
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs inline-flex items-center justify-center gap-1.5 shadow-xs transition"
          >
            <Package className="w-3.5 h-3.5" />
            <span>Xem đơn hàng của tôi</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <BrandSectionBackground
      variant="soft-blue"
      pattern="dot"
      patternOpacity={0.05}
      withGlow={true}
      className="min-h-full p-4 sm:p-8 space-y-6"
    >
      <Suspense fallback={<ScreenLoading message="Đang tải biên nhận đơn hàng..." />}>
        <ReceiptContent />
      </Suspense>
    </BrandSectionBackground>
  );
}
