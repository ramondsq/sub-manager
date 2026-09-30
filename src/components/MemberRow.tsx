import type { Member } from "../../shared/types";
import { daysLeft, shortDate } from "../lib/format";
import { useApp } from "../lib/store";
import { DaysBadge, KindLogo } from "./ui";

export function MemberRow({ member, showSubscription = true }: { member: Member; showSubscription?: boolean }) {
  const { data, subsById, openMember, openRenew } = useApp();
  const sub = subsById.get(member.subscription_id);
  const days = daysLeft(data.today, member.expires_at);
  const status = member.archived ? <span className="badge badge-muted">已退出</span> : <DaysBadge days={days} />;

  return (
    <li className="member-row">
      <button type="button" className="member-main" onClick={() => openMember(member.id)}>
        {showSubscription && sub ? (
          <KindLogo kind={sub.kind} name={sub.name} size={38} />
        ) : (
          <span className="avatar">{member.name.slice(0, 1)}</span>
        )}
        <span className="member-text">
          <span className="member-name-line">
            <span className="member-name">{member.name}</span>
            {/* 窄屏时状态显示在名字旁边，给到期日腾出位置 */}
            <span className="status-inline">{status}</span>
          </span>
          <span className="member-sub">
            {shortDate(member.expires_at, data.today)} 到期
            {showSubscription && sub ? ` · ${sub.name}` : ""}
          </span>
        </span>
        <span className="status-side">{status}</span>
      </button>
      {!member.archived && (
        <button type="button" className="btn btn-soft btn-sm" onClick={() => openRenew(member)}>
          续费
        </button>
      )}
    </li>
  );
}
