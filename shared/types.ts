export const KINDS = ["spotify", "apple_music", "youtube", "netflix", "other"] as const;
export type Kind = (typeof KINDS)[number];

export interface Subscription {
  id: number;
  name: string;
  kind: Kind;
  max_members: number;
  /** 默认每人每月价格（分） */
  price_cents: number;
  note: string;
  sort_order: number;
  created_at: string;
}

export interface Member {
  id: number;
  subscription_id: number;
  name: string;
  contact: string;
  account: string;
  /** 单独定价（分）；null 表示使用订阅的默认价格 */
  price_cents: number | null;
  expires_at: string;
  archived: boolean;
  note: string;
  created_at: string;
}

export interface Payment {
  id: number;
  member_id: number;
  months: number;
  amount_cents: number;
  paid_at: string;
  prev_expires_at: string;
  new_expires_at: string;
  note: string;
  created_at: string;
}

export interface Settings {
  bark_url: string;
  /** 逗号分隔的天数，负数表示过期后第几天，例如 "3,1,0,-1,-3" */
  remind_days: string;
  notify_hour: number;
  timezone: string;
  app_url: string;
  reminder_template: string;
}

export interface Overview {
  today: string;
  subscriptions: Subscription[];
  members: Member[];
  income: { month: number; year: number };
  reminder_template: string;
}

export interface NotifyLogEntry {
  day: string;
  status: "sent" | "empty" | "failed";
  detail: string;
  created_at: number;
}

export interface Backup {
  app: "sub-manager";
  version: 1;
  exported_at: string;
  subscriptions: Subscription[];
  members: Member[];
  payments: Payment[];
  settings: Partial<Settings>;
}
