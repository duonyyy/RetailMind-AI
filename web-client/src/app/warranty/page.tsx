'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { BrandSectionBackground } from '@/components/patterns';
import { useCurrentUser } from '@/features/auth/useCurrentUser';
import { apiFetch } from '@/lib/api-client';
import { formatVND } from '@/lib/utils';
import {
  ShieldCheck,
  Search,
  CheckCircle2,
  RefreshCw,
  FileCheck2,
  Package,
  AlertCircle,
  LogIn,
  Store,
} from 'lucide-react';

interface VerifiedOrder {
  id: string;
  orderNo: string;
  storeId?: string;
  status: string;
  totalVnd?: string;
  createdAt?: string;
  items?: Array<{
    sku?: string;
    sku_snapshot?: string;
    title_snapshot?: string;
    name?: string;
    quantity?: number;
    unitPriceVnd?: string;
  }>;
}

export default function WarrantyPortalPage() {
  const { user, isLoading: isAuthLoading } = useCurrentUser();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchedOrder, setSearchedOrder] = useState<VerifiedOrder | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const [claimReason, setClaimReason] = useState('');
  const [claimStore, setClaimStore] = useState('MWG_HCM_001');
  const [contactPhone, setContactPhone] = useState('');
  const [isSubmittingClaim, setIsSubmittingClaim] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [submittedTicketCode, setSubmittedTicketCode] = useState<string | null>(null);

  useEffect(() => {
    if (user?.phone) {
      setContactPhone(user.phone);
    }
  }, [user]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    setIsSearching(true);
    setSearchError(null);
    setSearchedOrder(null);
    setSubmittedTicketCode(null);

    try {
      const res = await apiFetch<any>(`orders/${encodeURIComponent(query)}`, { retries: 0 });
      if (res.success && res.data) {
        setSearchedOrder(res.data);
      } else {
        setSearchError('Không tìm thấy đơn hàng với mã đã nhập. Quý khách vui lòng kiểm tra lại mã đơn hàng từ Lịch sử đơn hàng.');
      }
    } catch {
      setSearchError('Không thể tra cứu đơn hàng vào lúc này. Quý khách vui lòng đăng nhập để tra cứu đúng quyền sở hữu.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleClaimSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchedOrder) {
      setClaimError('Vui lòng tra cứu và chọn đơn hàng hợp lệ trước khi gửi yêu cầu.');
      return;
    }
    if (!claimReason.trim()) {
      setClaimError('Vui lòng nhập mô tả biểu hiện lỗi.');
      return;
    }
    const phone = contactPhone.trim();
    if (!phone || phone.replace(/\D/g, '').length < 9) {
      setClaimError('Vui lòng nhập số điện thoại liên hệ hợp lệ (tối thiểu 9 số).');
      return;
    }

    setIsSubmittingClaim(true);
    setClaimError(null);

    try {
      const res = await apiFetch<any>('support/tickets', {
        method: 'POST',
        body: JSON.stringify({
          orderId: searchedOrder.orderNo || searchedOrder.id,
          title: `Yêu cầu bảo hành / đổi mới 30 ngày cho đơn ${searchedOrder.orderNo}`,
          description: `Siêu thị tiếp nhận: ${claimStore}. Chi tiết lỗi: ${claimReason.trim()}`,
          confirmedProfilePhone: phone,
        }),
      });

      if (res.success && res.data) {
        const bodyData = res.data.data || res.data;
        setSubmittedTicketCode(bodyData.ticketCode || bodyData.id || 'Đã ghi nhận');
      } else {
        throw new Error(res.error?.message || 'Không thể tạo phiếu bảo hành.');
      }
    } catch (err: any) {
      setClaimError(err.message || 'Đã xảy ra lỗi khi gửi yêu cầu. Vui lòng thử lại.');
    } finally {
      setIsSubmittingClaim(false);
    }
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
          <ShieldCheck className="w-5 h-5 text-blue-600" />
          <span>Cổng Bảo Hành &amp; Đổi Trả Điện Tử</span>
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Tra cứu thông tin bảo hành theo mã đơn hàng đã xác nhận và đăng ký thẩm định đổi mới sản phẩm lỗi trong 30 ngày.
        </p>
      </div>

      {/* Order Lookup Bar */}
      <form onSubmit={handleSearch} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Nhập mã đơn hàng (VD: ORD-... hoặc MWG-...)"
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          type="submit"
          disabled={isSearching || !searchQuery.trim()}
          className="ts-cta text-xs py-2.5 px-5 font-bold disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          {isSearching && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
          <span>{isSearching ? 'Đang tra cứu...' : 'Tra Cứu Đơn Hàng'}</span>
        </button>
      </form>

      {searchError && (
        <div role="alert" className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">{searchError}</p>
            <p className="text-slate-600 mt-1">
              Bạn có thể xem lại mã đơn chính xác tại mục{' '}
              <Link href="/orders" className="text-blue-600 hover:underline font-bold">
                Đơn hàng của tôi
              </Link>.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Verified Order Info */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <FileCheck2 className="w-4 h-4 text-emerald-600" />
              <h2 className="text-sm font-bold text-slate-900">Thông Tin Hóa Đơn Điện Tử</h2>
            </div>
            {searchedOrder ? (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Đã xác nhận
              </span>
            ) : (
              <span className="text-[11px] text-slate-400">Chưa chọn đơn hàng</span>
            )}
          </div>

          {searchedOrder ? (
            <div className="space-y-3 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-slate-50">
                <span className="text-slate-500">Mã đơn hàng:</span>
                <span className="font-mono font-bold text-blue-600">{searchedOrder.orderNo}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-50">
                <span className="text-slate-500">Trạng thái xử lý:</span>
                <span className="font-semibold text-slate-800 uppercase">{searchedOrder.status}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-50">
                <span className="text-slate-500">Thời gian tạo đơn:</span>
                <span className="font-semibold text-slate-800">
                  {searchedOrder.createdAt ? new Date(searchedOrder.createdAt).toLocaleString('vi-VN') : 'Chưa có thông tin'}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-50">
                <span className="text-slate-500">Tổng giá trị:</span>
                <span className="font-bold text-slate-900">
                  {searchedOrder.totalVnd ? formatVND(searchedOrder.totalVnd) : 'Chưa có thông tin'}
                </span>
              </div>

              <div className="pt-2">
                <div className="font-semibold text-slate-700 mb-2">Danh sách sản phẩm trong hóa đơn:</div>
                <div className="space-y-2">
                  {searchedOrder.items && searchedOrder.items.length > 0 ? (
                    searchedOrder.items.map((item, idx) => (
                      <div key={idx} className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                        <div className="font-bold text-slate-900">{item.name || item.title_snapshot || 'Laptop MWG'}</div>
                        <div className="text-slate-500 text-[11px] flex justify-between mt-1">
                          <span>SKU: {item.sku || item.sku_snapshot || 'Chưa có thông tin'}</span>
                          <span>Số lượng: {item.quantity || 1}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-slate-400 italic">Chi tiết danh mục chưa có thông tin</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center space-y-2">
              <Package className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-xs text-slate-500">
                Vui lòng nhập mã đơn hàng của bạn vào thanh tìm kiếm phía trên để kiểm tra thông tin bảo hành.
              </p>
              {!user && !isAuthLoading && (
                <div className="pt-2">
                  <Link href="/login" className="text-xs text-blue-600 hover:underline font-semibold inline-flex items-center gap-1">
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Đăng nhập để xem danh sách đơn hàng đã mua</span>
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Warranty Claim Form */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
            Đăng Ký Thẩm Định Đổi Mới / Bảo Hành
          </h2>

          {submittedTicketCode ? (
            <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-3 text-xs">
              <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
              <div className="font-bold text-base text-emerald-900">
                Đã tiếp nhận yêu cầu bảo hành!
              </div>
              <p className="text-slate-600">
                Mã phiếu hỗ trợ của bạn:{' '}
                <span className="font-mono font-bold text-slate-900">{submittedTicketCode}</span>
              </p>
              <p className="text-slate-500">
                Quý khách có thể theo dõi tiến độ giải quyết tại trang{' '}
                <Link href="/support" className="text-blue-600 font-bold hover:underline">
                  Trung tâm Hỗ trợ
                </Link>.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSubmittedTicketCode(null);
                  setClaimReason('');
                }}
                className="ts-cta py-2 px-4 text-xs mt-2"
              >
                Gửi yêu cầu khác
              </button>
            </div>
          ) : (
            <form onSubmit={handleClaimSubmit} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Đơn hàng áp dụng:
                </label>
                <input
                  type="text"
                  readOnly
                  value={searchedOrder ? searchedOrder.orderNo : 'Chưa chọn đơn hàng'}
                  className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 font-mono"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Số điện thoại liên hệ xác nhận:
                </label>
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="Nhập số điện thoại của quý khách..."
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Chọn siêu thị MWG tiếp nhận thiết bị:
                </label>
                <select
                  value={claimStore}
                  onChange={(e) => setClaimStore(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="MWG_HCM_001">136 Nguyễn Thái Học, Q.1, TP.HCM</option>
                  <option value="MWG_HN_002">117 Thái Hà, Đống Đa, Hà Nội</option>
                  <option value="MWG_DN_003">320 đường 2 Tháng 9, Hải Châu, Đà Nẵng</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Mô tả chi tiết tình trạng lỗi phần cứng:
                </label>
                <textarea
                  rows={3}
                  value={claimReason}
                  onChange={(e) => setClaimReason(e.target.value)}
                  placeholder="Mô tả cụ thể hiện tượng lỗi kỹ thuật gặp phải trên thiết bị..."
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {claimError && (
                <p role="alert" className="text-xs text-rose-700 font-medium">
                  {claimError}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmittingClaim || !searchedOrder}
                className="ts-cta py-2.5 px-5 text-xs font-bold disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {isSubmittingClaim && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{isSubmittingClaim ? 'Đang gửi...' : 'Gửi Yêu Cầu Thẩm Định'}</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </BrandSectionBackground>
  );
}
