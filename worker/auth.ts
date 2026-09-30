import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

const COOKIE = "sm_session";
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 10;

const encoder = new TextEncoder();

async function sha256(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(s)));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** 比较两个密码的哈希，耗时与内容无关，避免计时攻击。 */
export async function passwordMatches(input: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256(input), sha256(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function createSession(c: Context, db: D1Database): Promise<void> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const token = toHex(raw);
  const now = Date.now();
  await db
    .prepare(`INSERT INTO sessions (token_hash, expires_at, created_at) VALUES (?, ?, ?)`)
    .bind(toHex(await sha256(token)), now + SESSION_TTL_MS, now)
    .run();
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function hasValidSession(c: Context, db: D1Database): Promise<boolean> {
  const token = getCookie(c, COOKIE);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return false;
  const row = await db
    .prepare(`SELECT expires_at FROM sessions WHERE token_hash = ?`)
    .bind(toHex(await sha256(token)))
    .first<{ expires_at: number }>();
  return !!row && row.expires_at > Date.now();
}

export async function destroySession(c: Context, db: D1Database): Promise<void> {
  const token = getCookie(c, COOKIE);
  if (token) {
    await db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).bind(toHex(await sha256(token))).run();
  }
  deleteCookie(c, COOKIE, { path: "/" });
}

export function clientIp(c: Context): string {
  return c.req.header("CF-Connecting-IP") ?? "unknown";
}

export async function tooManyAttempts(db: D1Database, ip: string): Promise<boolean> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND attempted_at > ?`)
    .bind(ip, Date.now() - ATTEMPT_WINDOW_MS)
    .first<{ n: number }>();
  return (row?.n ?? 0) >= MAX_FAILED_ATTEMPTS;
}

export async function recordFailedAttempt(db: D1Database, ip: string): Promise<void> {
  await db.prepare(`INSERT INTO login_attempts (ip, attempted_at) VALUES (?, ?)`).bind(ip, Date.now()).run();
}

export async function clearFailedAttempts(db: D1Database, ip: string): Promise<void> {
  await db.prepare(`DELETE FROM login_attempts WHERE ip = ?`).bind(ip).run();
}

export async function cleanupAuth(db: D1Database): Promise<void> {
  const now = Date.now();
  await db.batch([
    db.prepare(`DELETE FROM sessions WHERE expires_at < ?`).bind(now),
    db.prepare(`DELETE FROM login_attempts WHERE attempted_at < ?`).bind(now - ATTEMPT_WINDOW_MS),
  ]);
}
