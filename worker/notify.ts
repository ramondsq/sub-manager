import { describeDaysLeft, diffDays, zonedNow } from "../shared/dates";
import type { Settings } from "../shared/types";
import { getSettings, parseBarkUrl, parseRemindDays } from "./settings";

interface DueRow {
  name: string;
  expires_at: string;
  subscription: string;
}

export interface Digest {
  title: string;
  body: string;
  count: number;
}

/** 生成某一天的到期提醒内容；没有需要提醒的成员时 count 为 0。 */
export async function buildDigest(db: D1Database, settings: Settings, today: string): Promise<Digest> {
  const remindDays = new Set(parseRemindDays(settings.remind_days));
  const { results } = await db
    .prepare(
      `SELECT m.name, m.expires_at, s.name AS subscription
       FROM members m JOIN subscriptions s ON s.id = m.subscription_id
       WHERE m.archived = 0
       ORDER BY m.expires_at, s.sort_order, m.name`,
    )
    .all<DueRow>();

  const due = results
    .map((r) => ({ ...r, days: diffDays(today, r.expires_at) }))
    .filter((r) => remindDays.has(r.days));
  if (!due.length) return { title: "", body: "", count: 0 };

  const lines = due.map((r) => `${describeDaysLeft(r.days)}：${r.name}（${r.subscription}，${r.expires_at}）`);
  const expiredTotal = results.filter((r) => r.expires_at < today).length;
  const expiredListed = due.filter((r) => r.days < 0).length;
  if (expiredTotal > expiredListed) lines.push(`另外还有 ${expiredTotal - expiredListed} 人已过期未续费`);

  return { title: `订阅到期提醒 · ${due.length} 人`, body: lines.join("\n"), count: due.length };
}

export async function sendBark(settings: Settings, title: string, body: string): Promise<void> {
  const bark = parseBarkUrl(settings.bark_url);
  if (!bark) throw new Error("还没有设置 Bark 地址");
  const payload: Record<string, string> = { device_key: bark.key, title, body, group: "订阅管理" };
  if (settings.app_url) {
    payload.url = settings.app_url;
    payload.icon = `${settings.app_url}/icon-192.png`;
  }
  const res = await fetch(bark.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let code: unknown;
  try {
    code = (JSON.parse(text) as { code?: unknown }).code;
  } catch {
    // 非 JSON 响应，按 HTTP 状态判断
  }
  if (!res.ok || (code !== undefined && code !== 200)) {
    throw new Error(`Bark 返回错误（HTTP ${res.status}）：${text.slice(0, 200)}`);
  }
}

async function writeLog(db: D1Database, day: string, status: string, detail: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO notify_log (day, status, detail, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(day) DO UPDATE SET status = excluded.status, detail = excluded.detail, created_at = excluded.created_at`,
    )
    .bind(day, status, detail.slice(0, 2000), Date.now())
    .run();
}

/**
 * 由 Cron 每小时调用一次。到了设置的推送时间后，每天最多成功推送一次；
 * 推送失败会在之后的每个小时重试，直到当天结束。
 */
export async function runScheduledNotify(db: D1Database, now = new Date()): Promise<string> {
  const settings = await getSettings(db);
  if (!settings.bark_url) return "skip: bark not configured";
  const { date, hour } = zonedNow(settings.timezone, now);
  if (hour < settings.notify_hour) return `skip: ${hour}h < ${settings.notify_hour}h`;

  const log = await db.prepare(`SELECT status FROM notify_log WHERE day = ?`).bind(date).first<{ status: string }>();
  if (log && log.status !== "failed") return `skip: already ${log.status}`;

  const digest = await buildDigest(db, settings, date);
  if (!digest.count) {
    await writeLog(db, date, "empty", "");
    return "empty";
  }
  try {
    await sendBark(settings, digest.title, digest.body);
    await writeLog(db, date, "sent", digest.body);
    return "sent";
  } catch (err) {
    await writeLog(db, date, "failed", String(err instanceof Error ? err.message : err));
    return "failed";
  }
}

export async function cleanupNotifyLog(db: D1Database): Promise<void> {
  const cutoff = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  await db.prepare(`DELETE FROM notify_log WHERE day < ?`).bind(cutoff).run();
}
