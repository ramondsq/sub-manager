import { describeDaysLeft, diffDays } from "../../shared/dates";
import type { Kind, Member, Subscription } from "../../shared/types";

export const KIND_META: Record<Kind, { label: string; color: string; glyph: string }> = {
  spotify: { label: "Spotify", color: "#1db954", glyph: "S" },
  apple_music: { label: "Apple Music", color: "#fa2d48", glyph: "♪" },
  youtube: { label: "YouTube Premium", color: "#ff0033", glyph: "▶" },
  netflix: { label: "Netflix", color: "#e50914", glyph: "N" },
  other: { label: "其他", color: "#6366f1", glyph: "" },
};

export function yuan(cents: number): string {
  const v = cents / 100;
  return `¥${Number.isInteger(v) ? v : v.toFixed(2)}`;
}

/** 把输入框里的金额（元）转成分；空字符串返回 null，格式错误返回 NaN。 */
export function parseYuan(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN;
  return Math.round(Number(t) * 100);
}

export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return String(cents / 100);
}

export function memberPrice(m: Member, sub: Subscription | undefined): number {
  return m.price_cents ?? sub?.price_cents ?? 0;
}

export type Urgency = "expired" | "soon" | "week" | "month" | "later";

export function urgency(days: number): Urgency {
  if (days < 0) return "expired";
  if (days <= 3) return "soon";
  if (days <= 7) return "week";
  if (days <= 30) return "month";
  return "later";
}

export function daysLeft(today: string, date: string): number {
  return diffDays(today, date);
}

export function statusText(days: number): string {
  return describeDaysLeft(days);
}

/** "2026-10-15" → "10月15日"，不是今年的会带上年份。 */
export function shortDate(date: string, today: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const md = `${m}月${d}日`;
  return date.slice(0, 4) === today.slice(0, 4) ? md : `${y}年${md}`;
}

export function fillTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (all, key: string) => vars[key] ?? all);
}

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // 某些浏览器（比如非 HTTPS 环境）不支持 clipboard API，退回到老办法
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand("copy");
  ta.remove();
  if (!ok) throw new Error("复制失败，请手动复制");
}
