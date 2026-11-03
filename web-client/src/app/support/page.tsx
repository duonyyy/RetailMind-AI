'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { BrandSectionBackground } from '@/components/patterns';
import { apiFetch } from '@/lib/api-client';
import { useCurrentUser } from '@/features/auth/useCurrentUser';
import {
  Headphones,
  Send,
  MessageSquare,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  FileText,
  Clock,
  RefreshCw,
  LogIn,
} from 'lucide-react';

interface SupportTicketRecord {
  id: string;
  ticketCode: string;
  orderId?: string;
  title: string;
  description: string;
  status: string;
  createdAt: string;
}

export default function SupportPage() {
  const { user, isLoading: isAuthLoading } = useCurrentUser();
  const [topic, setTopic] = useState('WARRANTY');
  const [orderNo, setOrderNo] = useState('');
  const [description, setDescription] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [ticketCode, setTicketCode] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneConfirmed, setPhoneConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const [tickets, setTickets] = useState<SupportTicketRecord[]>([]);
  const [isLoadingTickets, setIsLoadingTickets] = useState(false);

  const fetchTickets = async () => {
    setIsLoadingTickets(true);
    try {
      const res = await apiFetch<any>('support/tickets', { retries: 0 });
      if (res.success && res.data) {
        const list = Array.isArray(res.data) ? res.data : (res.data as any)?.tickets || [];
        setTickets(list);
      }
    } catch {
      // Ignored if unauthenticated
    } finally {
      setIsLoadingTickets(false);
    }
  };

  useEffect(() => {
    if (user?.phone) {
      setPhone(user.phone);
      setPhoneConfirmed(true);
    }
    if (user) {
      fetchTickets();
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending || !description.trim() || !orderNo.trim()) return;

    const contactPhone = phone.trim();
    if (!contactPhone || contactPhone.replace(/\D/g, '').length < 9) {
      setError('Vui lòng cung cấp số điện thoại liên hệ hợp lệ (tối thiểu 9 số).');
      return;
    }

    setError('');
    setPending(true);
    try {
      const res = await apiFetch<any>('support/tickets', {
        method: 'POST',
        body: JSON.stringify({
          orderId: orderNo.trim(),
          title: `Yêu cầu hỗ trợ: ${topic}`,
          description: description.trim(),
          confirmedProfilePhone: contactPhone,
        }),
      });

      if (!res.success) {
        throw new Error(res.error?.message || 'Không thể gửi phiếu hỗ trợ.');
      }

      const bodyData = res.data?.data || res.data;
      const code = bodyData?.ticketCode || bodyData?.id || 'Đã ghi nhận';
      setTicketCode(code);
      setSubmitted(true);
      fetchTickets();
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Không thể gửi phiếu hỗ trợ. Vui lòng thử lại.');
    } finally {
      setPending(false);
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
          <Headphones className="w-5 h-5 text-blue-600" />
          <span>Trung Tâm Hỗ Trợ &amp; Tiếp Nhận Khiếu Nại Khách Hàng</span>
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Gửi yêu cầu bảo hành, đổi trả và phản ánh chất lượng dịch vụ. Đội ngũ CSKH tiếp nhận và xử lý liên tục.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Support Ticket Form */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          {!user && !isAuthLoading ? (
            <div className="py-8 text-center space-y-3">
              <Headphones className="w-10 h-10 text-slate-300 mx-auto" />
              <h2 className="text-base font-bold text-slate-900">Yêu cầu đăng nhập</h2>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Để tạo phiếu hỗ trợ gắn liền với đơn hàng và được bảo đảm quyền lợi, quý khách vui lòng đăng nhập tài khoản.
              </p>
              <Link
                href="/login"
                className="ts-cta text-xs py-2 px-5 inline-flex items-center gap-1.5"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Đăng nhập để gửi yêu cầu</span>
              </Link>
            </div>
          ) : submitted ? (
            <div className="ts-badge-success p-6 rounded-2xl text-center space-y-3">
              <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
              <h2 className="text-base font-bold text-slate-900">
                Đã tiếp nhận yêu cầu hỗ trợ thành công!
              </h2>
              <p className="text-xs text-slate-600 max-w-md mx-auto">
                Mã phiếu hỗ trợ đã được ghi nhận vào hệ thống:{' '}
                <span className="font-mono font-bold text-slate-900">{ticketCode}</span>.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSubmitted(false);
                  setDescription('');
                  setOrderNo('');
                  setTicketCode('');
                }}
                className="ts-cta text-xs py-2 px-4 mt-2"
              >
                Gửi yêu cầu khác
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
                Tạo Phiếu Hỗ Trợ Mới
              </h2>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                  Vấn đề cần hỗ trợ:
                </label>
                <select
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="WARRANTY">Yêu cầu bảo hành / Sửa chữa chính hãng</option>
                  <option value="RETURN">Đổi trả sản phẩm lỗi trong 30 ngày</option>
                  <option value="DELIVERY">Khiếu nại giao hàng trễ / Hư hỏng vỏ hộp</option>
                  <option value="REFUND">Yêu cầu bồi hoàn tiền hàng</option>
                  <option value="OTHER">Vấn đề khác</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                  Mã đơn hàng liên quan:
                </label>
                <input
                  type="text"
                  value={orderNo}
                  onChange={(e) => setOrderNo(e.target.value)}
                  placeholder="VD: ORD-... hoặc MWG-20261026-9812"
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                  Số điện thoại liên hệ xác nhận:
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Nhập số điện thoại liên lạc..."
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                  Mô tả chi tiết tình trạng:
                </label>
                <textarea
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Vui lòng cung cấp chi tiết lỗi của máy hoặc nội dung khiếu nại..."
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={phoneConfirmed}
                  onChange={(e) => setPhoneConfirmed(e.target.checked)}
                />
                <span>
                  Tôi xác nhận số điện thoại trên là chính xác để nhân viên CSKH liên hệ xử lý.
                </span>
              </label>

              {error && <p role="alert" className="text-xs text-red-700 font-medium">{error}</p>}

              <button
                type="submit"
                disabled={pending || !phoneConfirmed || !orderNo.trim() || !description.trim()}
                className="ts-cta text-xs py-2.5 px-5 disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{pending ? 'Đang gửi...' : 'Gửi Yêu Cầu Hỗ Trợ'}</span>
              </button>
            </form>
          )}
        </div>

        {/* Quick Help & Hotline */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
            <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-blue-600" />
              <span>Câu hỏi thường gặp</span>
            </h3>
            <div className="space-y-2 text-xs text-slate-600">
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                <span className="font-bold text-slate-800 block mb-0.5">Quy trình đổi mới 30 ngày?</span>
                Mang sản phẩm kèm đầy đủ phụ kiện, vỏ hộp và hóa đơn đến bất kỳ siêu thị MWG gần nhất để thẩm định.
              </div>
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                <span className="font-bold text-slate-800 block mb-0.5">Thời gian xử lý bảo hành?</span>
                Tùy theo tình trạng lỗi và linh kiện chính hãng, nhân viên kỹ thuật sẽ thông báo tiến độ cụ thể.
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-blue-600 to-cyan-600 rounded-2xl p-5 text-white shadow-sm space-y-2">
            <div className="text-xs font-semibold opacity-90">Tổng Đài CSKH Miễn Cước</div>
            <div className="text-xl font-extrabold tracking-tight">1800 1060</div>
            <div className="text-[11px] opacity-80">Phục vụ từ 7:30 - 22:00 tất cả các ngày trong tuần.</div>
          </div>
        </div>
      </div>

      {/* Ticket History List */}
      {user && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              <span>Lịch Sử Phiếu Hỗ Trợ Đã Gửi ({tickets.length})</span>
            </h2>
            <button
              onClick={() => fetchTickets()}
              disabled={isLoadingTickets}
              className="p-1.5 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-slate-50 transition"
              title="Làm mới danh sách"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingTickets ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {tickets.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">
              Quý khách chưa có phiếu hỗ trợ nào đang xử lý.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 text-xs">
              {tickets.map((t) => (
                <div key={t.id || t.ticketCode} className="py-3 flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-blue-600">{t.ticketCode}</span>
                      <span className="text-slate-400">•</span>
                      <span className="font-semibold text-slate-800">{t.title}</span>
                    </div>
                    <p className="text-slate-600 mt-1 line-clamp-2">{t.description}</p>
                    {t.orderId && (
                      <span className="text-[11px] font-mono text-slate-400 mt-1 block">
                        Đơn hàng: {t.orderId}
                      </span>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        t.status === 'resolved'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {t.status || 'Đang xử lý'}
                    </span>
                    <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1 justify-end">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(t.createdAt || Date.now()).toLocaleDateString('vi-VN')}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </BrandSectionBackground>
  );
}
