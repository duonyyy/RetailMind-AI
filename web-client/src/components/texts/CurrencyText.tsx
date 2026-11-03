import React from 'react';

interface CurrencyTextProps {
  amount: string | number | bigint;
  className?: string;
  showSymbol?: boolean;
}

/**
 * Định dạng tiền tệ VNĐ an toàn số học (Safe Currency Formatter)
 * Nhận giá trị kiểu string, number hoặc bigint, hiển thị định dạng chuẩn Việt Nam (24.990.000 ₫)
 * mà không dùng số thực để tính toán.
 */
export function CurrencyText({
  amount,
  className = '',
  showSymbol = true,
}: CurrencyTextProps) {
  const numericString = typeof amount === 'bigint' ? amount.toString() : typeof amount === 'number' ? Math.round(amount).toString() : String(amount || '0');
  const cleanNumber = numericString.replace(/\D/g, '');
  const formatted = cleanNumber.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  return (
    <span className={`font-mono tracking-tight font-semibold ${className || 'text-slate-900'}`}>
      {formatted || '0'}
      {showSymbol && <span className="ml-1 text-xs text-slate-500 font-sans">₫</span>}
    </span>
  );
}
