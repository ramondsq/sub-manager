import { useEffect, useState } from "react";
import type { Member, Payment } from "../../shared/types";
import { api, errorMessage } from "../lib/api";
import {
  copyText,
  daysLeft,
  fillTemplate,
  memberPrice,
  shortDate,
  statusText,
  yuan,
} from "../lib/format";
import { useApp } from "../lib/store";
import { IconArchive, IconCopy, IconEdit, IconRenew, IconTrash } from "./icons";
import { DaysBadge, KindLogo, Modal } from "./ui";

export function MemberSheet({ id, onClose }: { id: number; onClose: () => void }) {
  const { data, subsById, reload, toast, openRenew, openMemberForm } = useApp();
  const member = data.members.find((m) => m.id === id);
  const [payments, setPayments] = useState<Payment[] | null>(null);

  const expiresAt = member?.expires_at;
  useEffect(() => {
    let cancelled = false;
    api<Payment[]>(`/members/${id}/payments`)
      .then((p) => !cancelled && setPayments(p))
      .catch(() => !cancelled && setPayments([]));
    return () => {
      cancelled = true;
    };
    // 到期日变化（续费、撤销）后重新拉取收款记录
  }, [id, expiresAt]);

  useEffect(() => {
    if (!member) onClose();
  }, [member, onClose]);
  if (!member) return null;

  const sub = subsById.get(member.subscription_id);
  const days = daysLeft(data.today, member.expires_at);
  const price = memberPrice(member, sub);

  async function copyReminder(m: Member) {
    const text = fillTemplate(data.reminder_template, {
      name: m.name,
      subscription: sub?.name ?? "",
      date: shortDate(m.expires_at, data.today),
      days: String(days),
      status: statusText(days),
      price: String(price / 100),
    });
    try {
      await copyText(text);
      toast("提醒消息已复制");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  async function toggleArchive(m: Member) {
    if (!m.archived && !confirm(`把 ${m.name} 标记为已退出？退出后不再提醒，收款记录会保留。`)) return;
    try {
      await api(`/members/${m.id}`, { method: "PUT", body: { archived: !m.archived } });
      await reload();
      toast(m.archived ? "已恢复" : "已标记为退出");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  async function remove(m: Member) {
    if (!confirm(`确定删除 ${m.name} 吗？收款记录也会一起删除，无法恢复。\n\n如果只是不再续费，建议用“标记退出”。`)) return;
    try {
      await api(`/members/${m.id}`, { method: "DELETE" });
      onClose();
      await reload();
      toast("已删除");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  async function removePayment(p: Payment, isLatest: boolean) {
    const msg =
      isLatest && p.new_expires_at === member?.expires_at
        ? `撤销这笔续费？到期日会恢复为 ${p.prev_expires_at}。`
        : "删除这条收款记录？（不会修改到期日）";
    if (!confirm(msg)) return;
    try {
      const r = await api<{ reverted: boolean }>(`/payments/${p.id}`, { method: "DELETE" });
      setPayments((list) => list?.filter((x) => x.id !== p.id) ?? null);
      await reload();
      toast(r.reverted ? "已撤销，到期日已恢复" : "已删除记录");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  const total = payments?.reduce((n, p) => n + p.amount_cents, 0) ?? 0;

  return (
    <Modal
      title={
        <span className="sheet-title">
          {sub && <KindLogo kind={sub.kind} name={sub.name} size={28} />}
          {member.name}
        </span>
      }
      onClose={onClose}
    >
      <div className="sheet-status">
        <div>
          <div className="muted">到期日</div>
          <div className="big-date">{shortDate(member.expires_at, data.today)}</div>
        </div>
        {member.archived ? <span className="badge badge-muted">已退出</span> : <DaysBadge days={days} />}
      </div>

      <div className="actions">
        <button className="btn btn-primary" onClick={() => openRenew(member)}>
          <IconRenew /> 续费
        </button>
        <button className="btn" onClick={() => copyReminder(member)}>
          <IconCopy /> 复制提醒
        </button>
        <button className="btn" onClick={() => openMemberForm({ member })}>
          <IconEdit /> 编辑
        </button>
        <button className="btn" onClick={() => toggleArchive(member)}>
          <IconArchive /> {member.archived ? "恢复" : "标记退出"}
        </button>
      </div>

      <dl className="info">
        <dt>订阅</dt>
        <dd>{sub?.name}</dd>
        <dt>价格</dt>
        <dd>
          {yuan(price)}/月{member.price_cents === null && <span className="muted">（默认）</span>}
        </dd>
        {member.contact && (
          <>
            <dt>联系方式</dt>
            <dd className="selectable">{member.contact}</dd>
          </>
        )}
        {member.account && (
          <>
            <dt>账号</dt>
            <dd className="selectable">{member.account}</dd>
          </>
        )}
        {member.note && (
          <>
            <dt>备注</dt>
            <dd className="pre">{member.note}</dd>
          </>
        )}
        <dt>加入时间</dt>
        <dd>{member.created_at.slice(0, 10)}</dd>
      </dl>

      <h3 className="section-title">
        收款记录
        {payments && payments.length > 0 && <span className="muted">合计 {yuan(total)}</span>}
      </h3>
      {payments === null ? (
        <p className="muted">加载中…</p>
      ) : payments.length ? (
        <ul className="payments">
          {payments.map((p, i) => (
            <li key={p.id}>
              <div>
                <strong>
                  {p.months} 个月 · {yuan(p.amount_cents)}
                </strong>
                <span className="muted">
                  {p.paid_at} 收款 · {p.prev_expires_at} → {p.new_expires_at}
                  {p.note && ` · ${p.note}`}
                </span>
              </div>
              <button
                className="icon-btn"
                onClick={() => removePayment(p, i === 0)}
                aria-label={i === 0 ? "撤销这笔续费" : "删除记录"}
                title={i === 0 ? "撤销这笔续费" : "删除记录"}
              >
                <IconTrash />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">暂无收款记录</p>
      )}

      <button className="link-btn danger delete-member" onClick={() => remove(member)}>
        <IconTrash /> 删除成员
      </button>
    </Modal>
  );
}
