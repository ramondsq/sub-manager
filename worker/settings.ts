import { isValidTimeZone } from "../shared/dates";
import type { Settings } from "../shared/types";
import { HttpError, optionalString, requireInt } from "./http";

export const DEFAULT_SETTINGS: Settings = {
  bark_url: "",
  remind_days: "3,1,0,-1,-3",
  notify_hour: 9,
  timezone: "Asia/Shanghai",
  app_url: "",
  reminder_template:
    "Hi {name}，你的 {subscription} 会员将于 {date} 到期（{status}）。续费 {price} 元/月，需要续费的话跟我说一声哦～",
};

const KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[];

export async function getSettings(db: D1Database): Promise<Settings> {
  const { results } = await db.prepare(`SELECT key, value FROM settings`).all<{ key: string; value: string }>();
  const s: Settings = { ...DEFAULT_SETTINGS };
  for (const { key, value } of results) {
    if (key === "notify_hour") s.notify_hour = Number(value);
    else if ((KEYS as string[]).includes(key)) (s as unknown as Record<string, string>)[key] = value;
  }
  return s;
}

/** 解析提醒天数，例如 "3, 1, 0, -1" → [3, 1, 0, -1]。 */
export function parseRemindDays(s: string): number[] {
  const days = s
    .split(/[\s,，]+/)
    .filter(Boolean)
    .map(Number);
  if (days.some((d) => !Number.isInteger(d) || d < -365 || d > 365)) {
    throw new HttpError(400, "提醒天数格式错误，请填写用逗号分隔的整数，例如 3,1,0,-1");
  }
  return [...new Set(days)].sort((a, b) => b - a);
}

export function validateSettings(input: Record<string, unknown>): Partial<Settings> {
  const out: Partial<Settings> = {};
  if ("bark_url" in input) {
    const v = optionalString(input.bark_url, "Bark 地址", 500);
    if (v && !parseBarkUrl(v)) throw new HttpError(400, "Bark 地址格式错误");
    out.bark_url = v;
  }
  if ("remind_days" in input) {
    out.remind_days = parseRemindDays(optionalString(input.remind_days, "提醒天数", 200)).join(",");
  }
  if ("notify_hour" in input) out.notify_hour = requireInt(input.notify_hour, "推送时间", 0, 23);
  if ("timezone" in input) {
    const v = optionalString(input.timezone, "时区", 64);
    if (!v || !isValidTimeZone(v)) throw new HttpError(400, "时区无效，例如 Asia/Shanghai");
    out.timezone = v;
  }
  if ("app_url" in input) {
    const v = optionalString(input.app_url, "网站地址", 300).replace(/\/+$/, "");
    if (v && !/^https?:\/\/[^\s]+$/.test(v)) throw new HttpError(400, "网站地址格式错误");
    out.app_url = v;
  }
  if ("reminder_template" in input) {
    out.reminder_template = optionalString(input.reminder_template, "提醒模板", 1000);
  }
  return out;
}

export async function saveSettings(db: D1Database, patch: Partial<Settings>): Promise<void> {
  const entries = Object.entries(patch);
  if (!entries.length) return;
  await db.batch(
    entries.map(([key, value]) =>
      db
        .prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
        .bind(key, String(value)),
    ),
  );
}

/**
 * 支持以下几种写法：
 *   https://api.day.app/<key>
 *   https://api.day.app/<key>/这里改成你自己的推送内容   （Bark App 里复制出来的示例）
 *   <key>                                                （只填 key，默认使用官方服务器）
 */
export function parseBarkUrl(raw: string): { endpoint: string; key: string } | null {
  const v = raw.trim();
  if (!v) return null;
  if (!v.includes("://")) {
    return /^[A-Za-z0-9_-]+$/.test(v) ? { endpoint: "https://api.day.app/push", key: v } : null;
  }
  let url: URL;
  try {
    url = new URL(v);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const key = url.pathname.split("/").filter(Boolean)[0];
  if (!key || key === "push") return null;
  return { endpoint: `${url.origin}/push`, key };
}
