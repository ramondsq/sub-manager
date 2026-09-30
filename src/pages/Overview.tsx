import { useMemo, useState, type ReactNode } from "react";
import type { Member } from "../../shared/types";
import { MemberRow } from "../components/MemberRow";
import { IconPlus, IconSearch } from "../components/icons";
import { Empty } from "../components/ui";
import { daysLeft, shortDate, yuan } from "../lib/format";
import { navigate } from "../lib/router";
import { useApp } from "../lib/store";

type Filter = "all" | "expired" | "week" | "month";

const GROUPS: { key: string; title: string; test: (d: number) => boolean }[] = [
  { key: "expired", title: "已过期", test: (d) => d < 0 },
  { key: "today", title: "今天到期", test: (d) => d === 0 },
  { key: "week", title: "7 天内", test: (d) => d > 0 && d <= 7 },
  { key: "month", title: "30 天内", test: (d) => d > 7 && d <= 30 },
  { key: "later", title: "30 天以后", test: (d) => d > 30 },
];

const FILTERS: { key: Filter; label: string; test: (d: number) => boolean }[] = [
  { key: "all", label: "全部", test: () => true },
  { key: "expired", label: "已过期", test: (d) => d < 0 },
  { key: "week", label: "7 天内", test: (d) => d >= 0 && d <= 7 },
  { key: "month", label: "30 天内", test: (d) => d >= 0 && d <= 30 },
];

export function OverviewPage() {
  const { data, openMemberForm, openSubscriptionForm } = useApp();
  const [filter, setFilter] = useState<Filter>("all");
  const [subId, setSubId] = useState<number | "all">("all");
  const [query, setQuery] = useState("");

  const active = useMemo(() => data.members.filter((m) => !m.archived), [data.members]);
  const stats = useMemo(() => {
    const days = active.map((m) => daysLeft(data.today, m.expires_at));
    const seats = data.subscriptions.reduce((n, s) => n + s.max_members, 0);
    return {
      seats,
      expired: days.filter((d) => d < 0).length,
      week: days.filter((d) => d >= 0 && d <= 7).length,
    };
  }, [active, data.today, data.subscriptions]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const test = FILTERS.find((f) => f.key === filter)!.test;
    const list = active.filter((m) => {
      if (subId !== "all" && m.subscription_id !== subId) return false;
      if (q && !`${m.name} ${m.contact} ${m.account} ${m.note}`.toLowerCase().includes(q)) return false;
      return test(daysLeft(data.today, m.expires_at));
    });
    return GROUPS.map((g) => ({
      ...g,
      members: list.filter((m) => g.test(daysLeft(data.today, m.expires_at))),
    })).filter((g) => g.members.length);
  }, [active, data.today, filter, subId, query]);

  if (!data.subscriptions.length) {
    return (
      <>
        <PageTitle today={data.today} />
        <div className="card">
          <Empty title="还没有订阅">
            <p className="muted">先添加一个家庭订阅（比如 Spotify 家庭版），然后就可以往里面加成员了。</p>
            <button className="btn btn-primary" onClick={() => openSubscriptionForm()}>
              <IconPlus /> 添加订阅
            </button>
          </Empty>
        </div>
      </>
    );
  }

  return (
    <>
      <PageTitle today={data.today}>
        <button className="btn btn-primary" onClick={() => openMemberForm({})}>
          <IconPlus />
          <span>
            <span className="hide-sm">添加</span>成员
          </span>
        </button>
      </PageTitle>

      <section className="stats">
        <button className="stat" onClick={() => navigate("/subs")}>
          <span className="stat-label">在用成员</span>
          <span className="stat-value">
            {active.length}
            <small> / {stats.seats}</small>
          </span>
        </button>
        <button className={`stat ${stats.week ? "stat-warn" : ""}`} onClick={() => setFilter("week")}>
          <span className="stat-label">7 天内到期</span>
          <span className="stat-value">{stats.week}</span>
        </button>
        <button className={`stat ${stats.expired ? "stat-danger" : ""}`} onClick={() => setFilter("expired")}>
          <span className="stat-label">已过期</span>
          <span className="stat-value">{stats.expired}</span>
        </button>
        <div className="stat">
          <span className="stat-label">本月收入</span>
          <span className="stat-value">{yuan(data.income.month)}</span>
          <span className="stat-sub">今年 {yuan(data.income.year)}</span>
        </div>
      </section>

      <section className="toolbar">
        <div className="search">
          <IconSearch />
          <input
            className="input"
            type="search"
            placeholder="搜索成员、联系方式、备注"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          className="input select"
          value={subId}
          onChange={(e) => setSubId(e.target.value === "all" ? "all" : Number(e.target.value))}
          aria-label="按订阅筛选"
        >
          <option value="all">全部订阅</option>
          {data.subscriptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <div className="chips">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={filter === f.key ? "chip chip-active" : "chip"}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </section>

      {groups.length ? (
        groups.map((g) => <Group key={g.key} title={g.title} members={g.members} tone={g.key} />)
      ) : (
        <div className="card">
          <Empty title={active.length ? "没有符合条件的成员" : "还没有成员"}>
            {!active.length && (
              <button className="btn btn-primary" onClick={() => openMemberForm({})}>
                <IconPlus /> 添加成员
              </button>
            )}
          </Empty>
        </div>
      )}
    </>
  );
}

function PageTitle({ today, children }: { today: string; children?: ReactNode }) {
  const weekday = "日一二三四五六"[new Date(`${today}T00:00:00Z`).getUTCDay()];
  return (
    <header className="page-header">
      <div>
        <h1>到期概览</h1>
        <p className="muted">
          今天 {shortDate(today, today)} 星期{weekday}
        </p>
      </div>
      <div className="page-actions">{children}</div>
    </header>
  );
}

function Group({ title, members, tone }: { title: string; members: Member[]; tone: string }) {
  return (
    <section className="group">
      <h2 className={`group-title group-${tone}`}>
        {title} <span className="count">{members.length}</span>
      </h2>
      <ul className="card list">
        {members.map((m) => (
          <MemberRow key={m.id} member={m} />
        ))}
      </ul>
    </section>
  );
}
