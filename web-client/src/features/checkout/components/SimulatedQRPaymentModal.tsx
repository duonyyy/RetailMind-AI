'use client';

import React, { useState } from 'react';
import { QrCode, AlertCircle, RefreshCw, X, ShieldAlert, CheckCircle2 } from 'lucide-react';

export interface SimulatedQRPaymentModalProps {
  isOpen: boolean;
  orderNo: string;
  totalVnd: string;
  formattedTotal: string;
  storeName?: string;
  onSuccess: () => void | Promise<void>;
  onClose: () => void;
}

export function SimulatedQRPaymentModal({
  isOpen,
  orderNo,
  formattedTotal,
  storeName,
  onSuccess,
  onClose,
}: SimulatedQRPaymentModalProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSimulate() {
    setBusy(true);
    setError(null);
    try {
      await onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chưa nhận được phản hồi từ Core API.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-title"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <h2 id="payment-title" className="text-base font-bold text-slate-900">
                Thanh Toán Mô Phỏng QR
              </h2>
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-600">
                Sandbox Environment
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Đóng cửa sổ thanh toán"
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 disabled:opacity-40 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notice Card */}
        <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 text-xs text-amber-900 space-y-1">
          <div className="font-bold flex items-center gap-1.5 text-amber-950">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Môi trường thử nghiệm an toàn</span>
          </div>
          <p className="text-[11px] leading-relaxed text-amber-800">
            Chức năng thanh toán mang tính chất mô phỏng quy trình xử lý đơn hàng. Hệ thống không yêu cầu kết nối ngân hàng, không chuyển tiền thật và không đối soát với tài khoản ngân hàng thực tế.
          </p>
        </div>

        {/* Order Info Card */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-500">Mã đơn hàng:</span>
            <span className="font-mono font-bold text-blue-600">{orderNo}</span>
          </div>
          {storeName && (
            <div className="flex justify-between">
              <span className="text-slate-500">Địa điểm tiếp nhận:</span>
              <span className="font-semibold text-slate-800">{storeName}</span>
            </div>
          )}
          <div className="flex justify-between items-baseline pt-2 border-t border-slate-200">
            <span className="font-semibold text-slate-700">Tổng thanh toán:</span>
            <span className="text-lg font-extrabold text-blue-600 tabular-nums">
              {formattedTotal}
            </span>
          </div>
        </div>

        {/* Mock QR Visualization */}
        <div className="text-center p-4 border border-dashed border-slate-300 rounded-xl bg-slate-50/50 space-y-2">
          <div className="inline-block p-3 bg-white rounded-xl border border-slate-200 shadow-xs">
            <div className="w-32 h-32 bg-slate-100 rounded-lg flex flex-col items-center justify-center text-slate-400 font-mono text-[10px] space-y-1">
              <QrCode className="w-12 h-12 text-slate-400" />
              <span className="font-bold text-slate-500">MÃ QR MÔ PHỎNG</span>
              <span className="text-[9px] text-slate-400">TEST SANDBOX</span>
            </div>
          </div>
          <p className="text-[11px] text-slate-500">
            Nhấn nút xác nhận bên dưới để gửi yêu cầu thanh toán mô phỏng đến Core API.
          </p>
        </div>

        {error && (
          <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-800 flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2 pt-1">
          <button
            type="button"
            disabled={busy}
            onClick={handleSimulate}
            className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition"
          >
            {busy ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Đang chờ Core xác nhận...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Xác Nhận Thanh Toán Mô Phỏng</span>
              </>
            )}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="w-full py-2 px-4 rounded-xl bg-slate-50 hover:bg-slate-100 disabled:opacity-50 text-slate-600 font-semibold text-xs transition"
          >
            Để thanh toán sau
          </button>
        </div>
      </section>
    </div>
  );
}
