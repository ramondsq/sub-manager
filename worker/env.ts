export interface Env {
  DB: D1Database;
  /** 登录密码，用 `wrangler secret put ADMIN_PASSWORD` 或在 Cloudflare 控制台设置 */
  ADMIN_PASSWORD?: string;
}
