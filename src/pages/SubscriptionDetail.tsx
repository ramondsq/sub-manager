import { useState } from "react";
import { MemberRow } from "../components/MemberRow";
import { IconBack, IconEdit, IconPlus, IconTrash } from "../components/icons";
import { Empty, KindLogo } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { KIND_META, yuan } from "../lib/format";
import { navigate } from "../lib/router";
import { useApp } from "../lib/store";

export function SubscriptionDetailPage({ id }: { id: number }) {
  const { data, subsById, openMemberForm, openSubscriptionForm, reload, toast } = useApp();
  const [showArchived, setShowArchived] = useState(false);
  const sub = subsById.get(id);

  if (!sub) {
    return (
      <div className="card">
        <Empty title="订阅不存在或已被删除">
          <button className="btn" onClick={() => navigate("/subs")}>
            返回订阅列表
          </button>
        </Empty>
      </div>
    );
  }

  const members = data.members.filter((m) => m.subscription_id === id);
  const active = members.filter((m) => !m.archived);
  const archived = members.filter((m) => m.archived);

  async function remove() {
    if (!sub) return;
    const warn = members.length
      ? `删除「${sub.name}」会同时删除其中 ${members.length} 个成员和他们的收款记录，确定吗？`
      : `确定删除「${sub.name}」吗？`;
    if (!confirm(warn)) return;
    try {
      await api(`/subscriptions/${sub.id}`, { method: "DELETE" });
      navigate("/subs", true);
      await reload();
      toast("已删除");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <>
      <header className="page-header">
        <div className="page-title-row">
          <button className="icon-btn" onClick={() => navigate("/subs")} aria-label="返回">
            <IconBack />
          </button>
          <KindLogo kind={sub.kind} name={sub.name} size={40} />
          <div>
            <h1>{sub.name}</h1>
            <p className="muted">
              {KIND_META[sub.kind].label} · 默认 {yuan(sub.price_cents)}/月 · {active.length}/{sub.max_members} 名额
            </p>
          </div>
        </div>
        <div className="page-actions">
          <button className="icon-btn" onClick={() => openSubscriptionForm(sub)} aria-label="编辑订阅" title="编辑订阅">
            <IconEdit />
          </button>
          <button className="icon-btn danger" onClick={remove} aria-label="删除订阅" title="删除订阅">
            <IconTrash />
          </button>
          <button className="btn btn-primary" onClick={() => openMemberForm({ subscriptionId: sub.id })}>
            <IconPlus />
            <span>
              <span className="hide-sm">添加</span>成员
            </span>
          </button>
        </div>
      </header>

      {sub.note && <p className="card note">{sub.note}</p>}

      {active.length ? (
        <ul className="card list">
          {active.map((m) => (
            <MemberRow key={m.id} member={m} showSubscription={false} />
          ))}
        </ul>
      ) : (
        <div className="card">
          <Empty title="还没有成员">
            <button className="btn btn-primary" onClick={() => openMemberForm({ subscriptionId: sub.id })}>
              <IconPlus /> 添加成员
            </button>
          </Empty>
        </div>
      )}

      {archived.length > 0 && (
        <section className="group">
          <button className="link-btn" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? "隐藏" : "显示"}已退出的成员（{archived.length}）
          </button>
          {showArchived && (
            <ul className="card list">
              {archived.map((m) => (
                <MemberRow key={m.id} member={m} showSubscription={false} />
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
