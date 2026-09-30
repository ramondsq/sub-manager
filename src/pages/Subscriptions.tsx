import { IconChevron, IconPlus } from "../components/icons";
import { Empty, KindLogo } from "../components/ui";
import { KIND_META, daysLeft, shortDate, yuan } from "../lib/format";
import { navigate } from "../lib/router";
import { useApp } from "../lib/store";

export function SubscriptionsPage() {
  const { data, openSubscriptionForm } = useApp();

  return (
    <>
      <header className="page-header">
        <div>
          <h1>订阅</h1>
          <p className="muted">{data.subscriptions.length} 个家庭计划</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => openSubscriptionForm()}>
            <IconPlus />
            <span>
              <span className="hide-sm">添加</span>订阅
            </span>
          </button>
        </div>
      </header>

      {!data.subscriptions.length && (
        <div className="card">
          <Empty title="还没有订阅">
            <p className="muted">比如 “Spotify 家庭版 1 号”、“Apple Music 家庭”。</p>
          </Empty>
        </div>
      )}

      <div className="sub-grid">
        {data.subscriptions.map((s) => {
          const members = data.members.filter((m) => m.subscription_id === s.id && !m.archived);
          const days = members.map((m) => daysLeft(data.today, m.expires_at));
          const expired = days.filter((d) => d < 0).length;
          const soon = days.filter((d) => d >= 0 && d <= 7).length;
          const next = members.find((m) => daysLeft(data.today, m.expires_at) >= 0);
          const pct = Math.min(100, (members.length / s.max_members) * 100);
          return (
            <a
              key={s.id}
              href={`/subs/${s.id}`}
              className="card sub-card"
              onClick={(e) => {
                e.preventDefault();
                navigate(`/subs/${s.id}`);
              }}
            >
              <div className="sub-card-head">
                <KindLogo kind={s.kind} name={s.name} size={44} />
                <div className="sub-card-title">
                  <strong>{s.name}</strong>
                  <span className="muted">
                    {KIND_META[s.kind].label} · {yuan(s.price_cents)}/月
                  </span>
                </div>
                <IconChevron className="muted" />
              </div>
              <div className="seats">
                <div className="seats-label">
                  <span>
                    已用 {members.length} / {s.max_members} 个名额
                  </span>
                  {members.length < s.max_members && (
                    <span className="muted">空 {s.max_members - members.length}</span>
                  )}
                </div>
                <div className="bar">
                  <div className="bar-fill" style={{ width: `${pct}%`, background: KIND_META[s.kind].color }} />
                </div>
              </div>
              <div className="sub-card-foot">
                {expired > 0 && <span className="badge badge-expired">{expired} 人已过期</span>}
                {soon > 0 && <span className="badge badge-week">{soon} 人 7 天内到期</span>}
                {!expired && !soon && next && (
                  <span className="muted">
                    最近到期：{next.name} · {shortDate(next.expires_at, data.today)}
                  </span>
                )}
                {!members.length && <span className="muted">还没有成员</span>}
              </div>
            </a>
          );
        })}
      </div>
    </>
  );
}
