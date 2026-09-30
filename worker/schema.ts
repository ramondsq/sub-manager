// 数据库结构在 Worker 运行时自动创建和升级，部署时不需要手动执行迁移。
// 以后要改表结构时，在 MIGRATIONS 末尾追加一组语句即可，不要修改已有的组。

const MIGRATIONS: string[][] = [
  [
    `CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'other',
      max_members INTEGER NOT NULL DEFAULT 5,
      price_cents INTEGER NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      contact TEXT NOT NULL DEFAULT '',
      account TEXT NOT NULL DEFAULT '',
      price_cents INTEGER,
      expires_at TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_members_subscription ON members(subscription_id)`,
    `CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      months INTEGER NOT NULL,
      amount_cents INTEGER NOT NULL DEFAULT 0,
      paid_at TEXT NOT NULL,
      prev_expires_at TEXT NOT NULL,
      new_expires_at TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_payments_member ON payments(member_id)`,
    `CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON payments(paid_at)`,
    `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS login_attempts (ip TEXT NOT NULL, attempted_at INTEGER NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS idx_login_attempts ON login_attempts(ip, attempted_at)`,
    `CREATE TABLE IF NOT EXISTS notify_log (
      day TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    )`,
  ],
];

let ready: Promise<void> | null = null;

export function ensureSchema(db: D1Database): Promise<void> {
  ready ??= migrate(db).catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

async function migrate(db: D1Database): Promise<void> {
  await db.prepare(`CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`).run();
  const row = await db.prepare(`SELECT value FROM _meta WHERE key = 'schema_version'`).first<{ value: string }>();
  let version = row ? Number(row.value) : 0;
  while (version < MIGRATIONS.length) {
    const next = version + 1;
    await db.batch([
      ...MIGRATIONS[version].map((sql) => db.prepare(sql)),
      db
        .prepare(
          `INSERT INTO _meta (key, value) VALUES ('schema_version', ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        )
        .bind(String(next)),
    ]);
    version = next;
  }
}
