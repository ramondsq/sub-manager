import type { ContentfulStatusCode } from "hono/utils/http-status";
import { isValidDate } from "../shared/dates";

export class HttpError extends Error {
  constructor(
    public status: ContentfulStatusCode,
    message: string,
  ) {
    super(message);
  }
}

export function requireString(v: unknown, field: string, max = 100): string {
  if (typeof v !== "string" || !v.trim()) throw new HttpError(400, `${field}不能为空`);
  if (v.trim().length > max) throw new HttpError(400, `${field}太长了（最多 ${max} 个字符）`);
  return v.trim();
}

export function optionalString(v: unknown, field: string, max = 500): string {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string") throw new HttpError(400, `${field}格式错误`);
  if (v.trim().length > max) throw new HttpError(400, `${field}太长了（最多 ${max} 个字符）`);
  return v.trim();
}

export function requireInt(v: unknown, field: string, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
    throw new HttpError(400, `${field}必须是 ${min} 到 ${max} 之间的整数`);
  }
  return v;
}

export function requireDate(v: unknown, field: string): string {
  if (!isValidDate(v)) throw new HttpError(400, `${field}不是有效日期`);
  return v;
}

export function parseId(v: string | undefined): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, "无效的 ID");
  return n;
}
