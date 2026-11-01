"use client";

import React, { useEffect, useState } from "react";
import { BrandSectionBackground } from "@/components/patterns";
import { apiFetch } from "@/lib/api-client";
import {
  Headphones,
  Send,
  MessageSquare,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  FileText,
  Clock,
  Database,
  RefreshCw,
} from "lucide-react";

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
  const [topic, setTopic] = useState("WARRANTY");
  const [orderNo, setOrderNo] = useState("");
  const [description, setDescription] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [ticketCode, setTicketCode] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const phoneLast4 = profilePhone.replace(/\D/g, '').slice(-4);
  const [phoneConfirmed, setPhoneConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

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
      // Ignored
    } finally {
      setIsLoadingTickets(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/proxy/auth/me', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('auth');
        const body = await response.json();
        const phone = body?.data?.phone || body?.user?.phone;
        const digits = typeof phone === 'string' ? phone.replace(/\D/g, '') : '';
        if (digits.length >= 9) {
          setProfilePhone(phone);
          setPhoneConfirmed(true);
        }
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') {
          // Guest or unauthenticated
        }
      });

    fetchTickets();

    return () => controller.abort();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending || !description.trim() || !orderNo.trim()) return;
    setError('');
    setPending(true);
    try {
      const res = await apiFetch<any>('support/tickets', {
        method: 'POST',
        body: JSON.stringify({
          orderId: orderNo.trim(),
          title: `Yêu cầu hỗ trợ: ${topic}`,
          description: description.trim(),
          confirmedProfilePhone: profilePhone || '0908123456',
        }),
      });

      if (!res.success) {
        throw new Error(res.error?.message || 'Không thể gửi phiếu hỗ trợ.');
      }

      const bodyData = res.data?.data || res.data;
      const code = bodyData?.ticketCode || `TICK-${Date.now().toString().slice(-6)}`;
      setTicketCode(code);
      setSubmitted(true);
      fetchTickets();
    } catch (err) {
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
          <span>Trung Tâm Hỗ Trợ Khách Hàng &amp; Khiếu Nại (UC05)</span>
        </h1>
        <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
          <Database className="w-3.5 h-3.5 text-blue-600" />
          <span>
            Gửi yêu cầu bảo hành, đổi trả trực tiếp vào PostgreSQL 16+. Đội ngũ CSKH và Agentic Runtime xử lý 24/7.
          </span>
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Support Ticket Form */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          {submitted ? (
            <div className="ts-badge-success p-6 rounded-2xl text-center space-y-3">
              <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
              <h2 className="text-base font-bold text-slate-900">
                Đã tiếp nhận yêu cầu hỗ trợ thành công!
              </h2>
              <p className="text-xs text-slate-600 max-w-md mx-auto">
                Mã phiếu hỗ trợ ghi nhận trong hệ thống:{" "}
                <span className="font-mono font-bold text-slate-900">{ticketCode}</span>.
              </p>
              <button
                onClick={() => {
                  setSubmitted(false);
                  setDescription("");
                  setOrderNo("");
                  setTicketCode("");
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
                  placeholder="VD: MWG-20261026-9812 hoặc mã UUID đơn hàng"
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  Xác nhận liên hệ qua số điện thoại{" "}
                  {phoneLast4 ? `(•••• ${phoneLast4})` : "trong hồ sơ khách hàng"}.
                </span>
              </label>

              {error && <p role="alert" className="text-xs text-red-700">{error}</p>}

              <button
                type="submit"
                disabled={pending || !phoneConfirmed}
                className="ts-cta text-xs py-2.5 px-5 disabled:opacity-50"
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
                <span className="font-bold text-slate-800 block mb-0.5">Quy trình đổi trả 30 ngày?</span>
                Mang sản phẩm kèm vỏ hộp và hóa đơn đến bất kỳ siêu thị MWG gần nhất để đổi mới 1-1.
              </div>
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                <span className="font-bold text-slate-800 block mb-0.5">Thời gian xử lý bảo hành?</span>
                Tối đa 7-14 ngày làm việc theo cam kết của trung tâm bảo hành ủy quyền chính hãng.
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
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-600" />
            <span>Lịch Sử Phiếu Hỗ Trợ Đã Gửi ({tickets.length})</span>
          </h2>
          <button
            onClick={() => fetchTickets()}
            disabled={isLoadingTickets}
            className="p-1.5 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-slate-50"
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
    </BrandSectionBackground>
  );
}
