// 所有日期都以 "YYYY-MM-DD" 字符串表示，不带时区；“今天”由设置里的时区决定。

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDate(s: unknown): s is string {
  if (typeof s !== "string") return false;
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

function parse(s: string): [number, number, number] {
  const m = DATE_RE.exec(s);
  if (!m) throw new Error(`Invalid date: ${s}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function fmt(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 加 n 个自然月，日期超出当月天数时取当月最后一天（1 月 31 日 + 1 个月 = 2 月 28/29 日）。 */
export function addMonths(date: string, n: number): string {
  const [y, m, d] = parse(date);
  const total = y * 12 + (m - 1) + n;
  const ty = Math.floor(total / 12);
  const tm = (total % 12) + 1;
  return fmt(ty, tm, Math.min(d, daysInMonth(ty, tm)));
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = parse(date);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return fmt(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** b - a 的天数。 */
export function diffDays(a: string, b: string): number {
  const [ay, am, ad] = parse(a);
  const [by, bm, bd] = parse(b);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** 某一时刻在指定时区的日期和小时。 */
export function zonedNow(timeZone: string, now: Date = new Date()): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { date: fmt(get("year"), get("month"), get("day")), hour: get("hour") };
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** 到期状态的中文描述，例如“今天到期”“3 天后到期”“已过期 2 天”。 */
export function describeDaysLeft(days: number): string {
  if (days === 0) return "今天到期";
  if (days === 1) return "明天到期";
  if (days > 0) return `${days} 天后到期`;
  return `已过期 ${-days} 天`;
}
