import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format currency in VND using integer/string arithmetic (Zero-Float Guarantee)
 * Complies with AGENTS.md Section 2.5: NUMERIC(18, 0) / Decimal exactness.
 */
export function formatVND(amount: number | string | bigint): string {
  if (typeof amount === "bigint") {
    const str = amount.toString();
    const isNeg = str.startsWith("-");
    const digits = isNeg ? str.slice(1) : str;
    const formatted = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `${isNeg ? "-" : ""}${formatted} ₫`;
  }

  const raw = typeof amount === "number" ? Math.round(amount).toString() : String(amount).trim();
  const isNegative = raw.startsWith("-");
  const cleanDigits = raw.replace(/\D/g, "");
  if (!cleanDigits) return "0 ₫";

  const normalized = cleanDigits.replace(/^0+(?=\d)/, "");
  const formatted = normalized.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${isNegative ? "-" : ""}${formatted} ₫`;
}

/**
 * Exact integer VND math helper using BigInt to eliminate IEEE 754 float errors
 */
export function parseVndBigInt(amount?: string | number | bigint | null): bigint {
  if (amount == null) return BigInt(0);
  if (typeof amount === "bigint") return amount;
  if (typeof amount === "number") return BigInt(Math.round(amount));
  const clean = String(amount).replace(/[^\d-]/g, "");
  return clean ? BigInt(clean) : BigInt(0);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
