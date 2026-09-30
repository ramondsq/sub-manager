import { KINDS, type Kind } from "../shared/types";
import { HttpError, optionalString, requireDate, requireInt, requireString } from "./http";

export type Body = Record<string, unknown>;

const MAX_PRICE_CENTS = 10_000_000;

/** partial = true 时只校验请求里出现的字段（用于更新）。 */
export function validateSubscription(body: Body, partial: boolean) {
  const out: Record<string, string | number> = {};
  const has = (k: string) => !partial || k in body;
  if (has("name")) out.name = requireString(body.name, "订阅名称", 50);
  if (has("kind")) {
    const kind = body.kind ?? "other";
    if (!KINDS.includes(kind as Kind)) throw new HttpError(400, "订阅类型无效");
    out.kind = kind as Kind;
  }
  if (has("max_members")) out.max_members = requireInt(body.max_members ?? 5, "可售名额", 1, 100);
  if (has("price_cents")) out.price_cents = requireInt(body.price_cents ?? 0, "默认价格", 0, MAX_PRICE_CENTS);
  if (has("note")) out.note = optionalString(body.note, "备注", 1000);
  if (has("sort_order")) out.sort_order = requireInt(body.sort_order ?? 0, "排序", -100_000, 100_000);
  return out;
}

export function validateMember(body: Body, partial: boolean) {
  const out: Record<string, string | number | null> = {};
  const has = (k: string) => !partial || k in body;
  if (has("subscription_id")) out.subscription_id = requireInt(body.subscription_id, "所属订阅", 1, Number.MAX_SAFE_INTEGER);
  if (has("name")) out.name = requireString(body.name, "成员名称", 50);
  if (has("contact")) out.contact = optionalString(body.contact, "联系方式", 200);
  if (has("account")) out.account = optionalString(body.account, "账号", 200);
  if (has("price_cents")) {
    out.price_cents =
      body.price_cents === null || body.price_cents === undefined
        ? null
        : requireInt(body.price_cents, "单独定价", 0, MAX_PRICE_CENTS);
  }
  if ("expires_at" in body) out.expires_at = requireDate(body.expires_at, "到期日");
  if ("archived" in body) {
    if (typeof body.archived !== "boolean") throw new HttpError(400, "archived 必须是布尔值");
    out.archived = body.archived ? 1 : 0;
  }
  if (has("note")) out.note = optionalString(body.note, "备注", 1000);
  return out;
}

export function validatePayment(body: Body) {
  return {
    months: requireInt(body.months, "月数", 1, 36),
    amount_cents: requireInt(body.amount_cents ?? 0, "金额", 0, MAX_PRICE_CENTS),
    note: optionalString(body.note, "备注", 500),
  };
}
