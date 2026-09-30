import { Hono, type Context } from "hono";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";
import { addMonths, zonedNow } from "../shared/dates";
import type { Backup, Member, NotifyLogEntry, Overview, Payment, Subscription } from "../shared/types";
import {
  cleanupAuth,
  clearFailedAttempts,
  clientIp,
  createSession,
  destroySession,
  hasValidSession,
  passwordMatches,
  recordFailedAttempt,
  tooManyAttempts,
} from "./auth";
import type { Env } from "./env";
import { HttpError, parseId, requireDate } from "./http";
import { buildDigest, cleanupNotifyLog, runScheduledNotify, sendBark } from "./notify";
import { ensureSchema } from "./schema";
import { getSettings, saveSettings, validateSettings } from "./settings";
import { type Body, validateMember, validatePayment, validateSubscription } from "./validate";

type AppContext = Context<{ Bindings: Env }>;
type MemberRow = Omit<Member, "archived"> & { archived: number };

const toMember = (r: MemberRow): Member => ({ ...r, archived: !!r.archived });

async function readJson(c: AppContext): Promise<Body> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HttpError(400, "请求格式错误");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "请求格式错误");
  return body as Body;
}

async function today(db: D1Database): Promise<string> {
  return zonedNow((await getSettings(db)).timezone).date;
}

async function getMember(db: D1Database, id: number): Promise<Member> {
  const row = await db.prepare(`SELECT * FROM members WHERE id = ?`).bind(id).first<MemberRow>();
  if (!row) throw new HttpError(404, "成员不存在");
  return toMember(row);
}

async function assertSubscriptionExists(db: D1Database, id: number): Promise<void> {
  const row = await db.prepare(`SELECT id FROM subscriptions WHERE id = ?`).bind(id).first();
  if (!row) throw new HttpError(400, "所属订阅不存在");
}

/** 字段名都来自校验函数的白名单，可以安全地拼进 SQL。 */
function updateStatement(db: D1Database, table: string, fields: Record<string, unknown>, id: number) {
  const keys = Object.keys(fields);
  if (!keys.length) throw new HttpError(400, "没有要更新的内容");
  return db
    .prepare(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ? RETURNING *`)
    .bind(...Object.values(fields), id);
}

const app = new Hono<{ Bindings: Env }>().basePath("/api");

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status);
  // 来自 Hono 中间件（例如 csrf 拦截跨站请求）
  if (err instanceof HTTPException) return c.json({ error: err.status === 403 ? "请求被拒绝" : err.message }, err.status);
  console.error(err);
  // 带上具体原因，方便排查（例如数据库没有绑定、D1 报错）
  return c.json({ error: `服务器出错了：${err instanceof Error ? err.message : String(err)}` }, 500);
});

app.use("*", async (c, next) => {
  if (!c.env.DB) {
    throw new HttpError(500, "Worker 没有绑定 D1 数据库：请在 Worker 的 Settings → Bindings 里添加 D1 绑定，变量名填 DB");
  }
  await ensureSchema(c.env.DB);
  await next();
  c.header("Cache-Control", "no-store");
});
app.use("*", csrf());

// ---------- 登录 ----------

app.post("/auth/login", async (c) => {
  const db = c.env.DB;
  if (!c.env.ADMIN_PASSWORD) {
    throw new HttpError(500, "服务器还没有设置 ADMIN_PASSWORD，请先在 Cloudflare 里添加这个密钥");
  }
  const ip = clientIp(c);
  if (await tooManyAttempts(db, ip)) throw new HttpError(429, "尝试次数太多，请 15 分钟后再试");
  const { password } = await readJson(c);
  if (typeof password !== "string" || !(await passwordMatches(password, c.env.ADMIN_PASSWORD))) {
    await recordFailedAttempt(db, ip);
    throw new HttpError(401, "密码错误");
  }
  await clearFailedAttempts(db, ip);
  await createSession(c, db);
  return c.json({ ok: true });
});

app.post("/auth/logout", async (c) => {
  await destroySession(c, c.env.DB);
  return c.json({ ok: true });
});

app.get("/auth/me", async (c) => c.json({ authenticated: await hasValidSession(c, c.env.DB) }));

// 以下接口都需要登录
app.use("*", async (c, next) => {
  if (!(await hasValidSession(c, c.env.DB))) throw new HttpError(401, "未登录");
  await next();
});

// ---------- 总览 ----------

app.get("/overview", async (c) => {
  const db = c.env.DB;
  const settings = await getSettings(db);
  const date = zonedNow(settings.timezone).date;
  const [subs, members, income] = await db.batch([
    db.prepare(`SELECT * FROM subscriptions ORDER BY sort_order, id`),
    db.prepare(`SELECT * FROM members ORDER BY expires_at, id`),
    db
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN substr(paid_at, 1, 7) = ? THEN amount_cents END), 0) AS month,
                COALESCE(SUM(amount_cents), 0) AS year
         FROM payments WHERE substr(paid_at, 1, 4) = ?`,
      )
      .bind(date.slice(0, 7), date.slice(0, 4)),
  ]);
  const inc = (income.results[0] ?? { month: 0, year: 0 }) as { month: number; year: number };
  return c.json<Overview>({
    today: date,
    subscriptions: subs.results as unknown as Subscription[],
    members: (members.results as unknown as MemberRow[]).map(toMember),
    income: { month: inc.month, year: inc.year },
    reminder_template: settings.reminder_template,
  });
});

// ---------- 订阅 ----------

app.post("/subscriptions", async (c) => {
  const db = c.env.DB;
  const f = validateSubscription(await readJson(c), false);
  const row = await db
    .prepare(
      `INSERT INTO subscriptions (name, kind, max_members, price_cents, note, sort_order)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
    )
    .bind(f.name, f.kind, f.max_members, f.price_cents, f.note, f.sort_order)
    .first<Subscription>();
  return c.json(row, 201);
});

app.put("/subscriptions/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  const f = validateSubscription(await readJson(c), true);
  const row = await updateStatement(c.env.DB, "subscriptions", f, id).first<Subscription>();
  if (!row) throw new HttpError(404, "订阅不存在");
  return c.json(row);
});

app.delete("/subscriptions/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  await c.env.DB.prepare(`DELETE FROM subscriptions WHERE id = ?`).bind(id).run();
  return c.json({ ok: true });
});

// ---------- 成员 ----------

app.post("/members", async (c) => {
  const db = c.env.DB;
  const body = await readJson(c);
  const f = validateMember(body, false);
  await assertSubscriptionExists(db, f.subscription_id as number);

  // 两种方式：直接指定到期日（从旧平台迁移过来时用），或者按“开始日期 + 月数”并记一笔收款
  const initial = body.initial as Body | undefined;
  let payment: { start: string; months: number; amount_cents: number; note: string } | null = null;
  if (initial && typeof initial === "object") {
    const start = requireDate(initial.start_date, "开始日期");
    payment = { start, ...validatePayment(initial) };
    f.expires_at = addMonths(start, payment.months);
  } else if (!f.expires_at) {
    throw new HttpError(400, "请填写到期日");
  }

  const insertMember = db
    .prepare(
      `INSERT INTO members (subscription_id, name, contact, account, price_cents, expires_at, note)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    )
    .bind(f.subscription_id, f.name, f.contact, f.account, f.price_cents, f.expires_at, f.note);
  if (!payment) {
    return c.json(toMember((await insertMember.first<MemberRow>())!), 201);
  }
  const [inserted] = await db.batch<MemberRow>([
    insertMember,
    db
      .prepare(
        `INSERT INTO payments (member_id, months, amount_cents, paid_at, prev_expires_at, new_expires_at, note)
         VALUES (last_insert_rowid(), ?, ?, ?, ?, ?, ?)`,
      )
      .bind(payment.months, payment.amount_cents, await today(db), payment.start, f.expires_at, payment.note),
  ]);
  return c.json(toMember(inserted.results[0]), 201);
});

app.put("/members/:id", async (c) => {
  const db = c.env.DB;
  const id = parseId(c.req.param("id"));
  const f = validateMember(await readJson(c), true);
  if (f.subscription_id !== undefined) await assertSubscriptionExists(db, f.subscription_id as number);
  const row = await updateStatement(db, "members", f, id).first<MemberRow>();
  if (!row) throw new HttpError(404, "成员不存在");
  return c.json(toMember(row));
});

app.delete("/members/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  await c.env.DB.prepare(`DELETE FROM members WHERE id = ?`).bind(id).run();
  return c.json({ ok: true });
});

app.post("/members/:id/renew", async (c) => {
  const db = c.env.DB;
  const id = parseId(c.req.param("id"));
  const body = await readJson(c);
  const p = validatePayment(body);
  const member = await getMember(db, id);
  const date = await today(db);
  const paidAt = body.paid_at === undefined ? date : requireDate(body.paid_at, "收款日期");
  // from = "expiry"：接着原到期日续（默认）；"today"：从今天重新算
  const base = body.from === "today" ? date : member.expires_at;
  const newExpiry = addMonths(base, p.months);

  const [updated] = await db.batch<MemberRow>([
    db.prepare(`UPDATE members SET expires_at = ?, archived = 0 WHERE id = ? RETURNING *`).bind(newExpiry, id),
    db
      .prepare(
        `INSERT INTO payments (member_id, months, amount_cents, paid_at, prev_expires_at, new_expires_at, note)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, p.months, p.amount_cents, paidAt, member.expires_at, newExpiry, p.note),
  ]);
  return c.json(toMember(updated.results[0]));
});

app.get("/members/:id/payments", async (c) => {
  const id = parseId(c.req.param("id"));
  const { results } = await c.env.DB.prepare(`SELECT * FROM payments WHERE member_id = ? ORDER BY id DESC`)
    .bind(id)
    .all<Payment>();
  return c.json(results);
});

/** 删除收款记录。如果删的是最近一笔续费，并且到期日没被改过，会把到期日恢复到续费前。 */
app.delete("/payments/:id", async (c) => {
  const db = c.env.DB;
  const id = parseId(c.req.param("id"));
  const payment = await db.prepare(`SELECT * FROM payments WHERE id = ?`).bind(id).first<Payment>();
  if (!payment) throw new HttpError(404, "记录不存在");
  const member = await getMember(db, payment.member_id);
  const latest = await db
    .prepare(`SELECT id FROM payments WHERE member_id = ? ORDER BY id DESC LIMIT 1`)
    .bind(member.id)
    .first<{ id: number }>();
  const revert = latest?.id === payment.id && member.expires_at === payment.new_expires_at;
  const del = db.prepare(`DELETE FROM payments WHERE id = ?`).bind(id);
  if (revert) {
    await db.batch([
      db.prepare(`UPDATE members SET expires_at = ? WHERE id = ?`).bind(payment.prev_expires_at, member.id),
      del,
    ]);
  } else {
    await del.run();
  }
  return c.json({ ok: true, reverted: revert });
});

// ---------- 设置和推送 ----------

app.get("/settings", async (c) => c.json(await getSettings(c.env.DB)));

app.put("/settings", async (c) => {
  await saveSettings(c.env.DB, validateSettings(await readJson(c)));
  return c.json(await getSettings(c.env.DB));
});

app.get("/notify/preview", async (c) => {
  const db = c.env.DB;
  const settings = await getSettings(db);
  return c.json(await buildDigest(db, settings, zonedNow(settings.timezone).date));
});

app.post("/notify/test", async (c) => {
  const body = await readJson(c);
  const settings = { ...(await getSettings(c.env.DB)), ...validateSettings(body) };
  try {
    await sendBark(settings, "订阅管理 · 测试通知", "如果你看到了这条消息，说明 Bark 推送设置成功 🎉");
  } catch (err) {
    throw new HttpError(502, err instanceof Error ? err.message : String(err));
  }
  return c.json({ ok: true });
});

app.post("/notify/run", async (c) => {
  const db = c.env.DB;
  const settings = await getSettings(db);
  const digest = await buildDigest(db, settings, zonedNow(settings.timezone).date);
  if (!digest.count) return c.json({ sent: false, message: "今天没有需要提醒的成员" });
  try {
    await sendBark(settings, digest.title, digest.body);
  } catch (err) {
    throw new HttpError(502, err instanceof Error ? err.message : String(err));
  }
  return c.json({ sent: true, message: `已推送 ${digest.count} 条提醒` });
});

app.get("/notify/log", async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT * FROM notify_log ORDER BY day DESC LIMIT 14`).all<NotifyLogEntry>();
  return c.json(results);
});

// ---------- 备份 ----------

app.get("/export", async (c) => {
  const db = c.env.DB;
  const [subs, members, payments] = await db.batch([
    db.prepare(`SELECT * FROM subscriptions ORDER BY id`),
    db.prepare(`SELECT * FROM members ORDER BY id`),
    db.prepare(`SELECT * FROM payments ORDER BY id`),
  ]);
  const backup: Backup = {
    app: "sub-manager",
    version: 1,
    exported_at: new Date().toISOString(),
    subscriptions: subs.results as unknown as Subscription[],
    members: (members.results as unknown as MemberRow[]).map(toMember),
    payments: payments.results as unknown as Payment[],
    settings: await getSettings(db),
  };
  return c.json(backup);
});

app.post("/import", async (c) => {
  const db = c.env.DB;
  const body = await readJson(c);
  if (body.app !== "sub-manager" || body.version !== 1) throw new HttpError(400, "不是有效的备份文件");
  const list = (v: unknown, name: string): Body[] => {
    if (!Array.isArray(v) || v.length > 10_000) throw new HttpError(400, `备份文件里的 ${name} 格式错误`);
    return v as Body[];
  };
  const idOf = (r: Body) => parseId(String(r.id));
  const createdAt = (r: Body) => (typeof r.created_at === "string" ? r.created_at.slice(0, 32) : new Date().toISOString());

  const subs = list(body.subscriptions, "subscriptions").map((r) => ({
    id: idOf(r),
    ...validateSubscription(r, false),
    created_at: createdAt(r),
  }));
  const subIds = new Set(subs.map((s) => s.id));
  const members = list(body.members, "members").map((r) => {
    const f = validateMember(r, false);
    if (!subIds.has(f.subscription_id as number)) throw new HttpError(400, `成员 ${f.name} 的所属订阅不存在`);
    if (!f.expires_at) throw new HttpError(400, `成员 ${f.name} 缺少到期日`);
    return { id: idOf(r), archived: 0, ...f, created_at: createdAt(r) };
  });
  const memberIds = new Set(members.map((m) => m.id));
  const payments = list(body.payments, "payments").map((r) => {
    const memberId = parseId(String(r.member_id));
    if (!memberIds.has(memberId)) throw new HttpError(400, "收款记录对应的成员不存在");
    return {
      id: idOf(r),
      member_id: memberId,
      ...validatePayment(r),
      paid_at: requireDate(r.paid_at, "收款日期"),
      prev_expires_at: requireDate(r.prev_expires_at, "续费前到期日"),
      new_expires_at: requireDate(r.new_expires_at, "续费后到期日"),
      created_at: createdAt(r),
    };
  });
  const settings =
    body.settings && typeof body.settings === "object" ? validateSettings(body.settings as Body) : {};

  // 用 json_each 一次插入整张表，避免语句数量过多
  const col = (name: string) => `json_extract(value, '$.${name}')`;
  const insertAll = (table: string, columns: string[], rows: unknown[]) =>
    db
      .prepare(`INSERT INTO ${table} (${columns.join(", ")}) SELECT ${columns.map(col).join(", ")} FROM json_each(?)`)
      .bind(JSON.stringify(rows));

  await db.batch([
    db.prepare(`DELETE FROM payments`),
    db.prepare(`DELETE FROM members`),
    db.prepare(`DELETE FROM subscriptions`),
    insertAll("subscriptions", ["id", "name", "kind", "max_members", "price_cents", "note", "sort_order", "created_at"], subs),
    insertAll(
      "members",
      ["id", "subscription_id", "name", "contact", "account", "price_cents", "expires_at", "archived", "note", "created_at"],
      members,
    ),
    insertAll(
      "payments",
      ["id", "member_id", "months", "amount_cents", "paid_at", "prev_expires_at", "new_expires_at", "note", "created_at"],
      payments,
    ),
  ]);
  await saveSettings(db, settings);
  return c.json({ ok: true, subscriptions: subs.length, members: members.length, payments: payments.length });
});

app.notFound((c) => c.json({ error: "Not found" }, 404));

export default {
  fetch: app.fetch,
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      (async () => {
        await ensureSchema(env.DB);
        console.log("notify:", await runScheduledNotify(env.DB));
        await cleanupAuth(env.DB);
        await cleanupNotifyLog(env.DB);
      })(),
    );
  },
} satisfies ExportedHandler<Env>;
