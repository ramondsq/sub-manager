import { useState, type FormEvent } from "react";
import { addMonths } from "../../shared/dates";
import type { Member } from "../../shared/types";
import { api, errorMessage } from "../lib/api";
import { centsToInput, daysLeft, memberPrice, parseYuan, shortDate, statusText } from "../lib/format";
import { useApp } from "../lib/store";
import { Field, Modal, MonthPicker } from "./ui";

export function RenewDialog({ member, onClose }: { member: Member; onClose: () => void }) {
  const { data, subsById, reload, toast } = useApp();
  const sub = subsById.get(member.subscription_id);
  const unit = memberPrice(member, sub);
  const days = daysLeft(data.today, member.expires_at);

  const [months, setMonths] = useState(1);
  const [from, setFrom] = useState<"expiry" | "today">("expiry");
  const [amount, setAmount] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [paidAt, setPaidAt] = useState(data.today);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const fromExpiry = addMonths(member.expires_at, months);
  const fromToday = addMonths(data.today, months);
  const shownAmount = amountTouched ? amount : centsToInput(unit * months);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const amountCents = parseYuan(shownAmount) ?? 0;
    if (Number.isNaN(amountCents)) return setError("金额格式不对，例如 15 或 12.5");
    setBusy(true);
    setError("");
    try {
      const updated = await api<Member>(`/members/${member.id}/renew`, {
        body: { months, amount_cents: amountCents, from, paid_at: paidAt, note },
      });
      await reload();
      toast(`${member.name} 已续费至 ${shortDate(updated.expires_at, data.today)}`);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`续费 · ${member.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" form="renew-form" disabled={busy}>
            {busy ? "保存中…" : `确认续费 ${months} 个月`}
          </button>
        </>
      }
    >
      <form id="renew-form" className="form" onSubmit={submit}>
        <p className="muted">
          {sub?.name} · 当前到期日 {shortDate(member.expires_at, data.today)}（{statusText(days)}）
        </p>
        <MonthPicker value={months} onChange={setMonths} />

        <div className="choice-list" role="radiogroup" aria-label="从哪天开始算">
          <button
            type="button"
            role="radio"
            aria-checked={from === "expiry"}
            className={from === "expiry" ? "choice active" : "choice"}
            onClick={() => setFrom("expiry")}
          >
            <span>接着原到期日续</span>
            <strong>→ {shortDate(fromExpiry, data.today)}</strong>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={from === "today"}
            className={from === "today" ? "choice active" : "choice"}
            onClick={() => setFrom("today")}
          >
            <span>从今天重新开始算</span>
            <strong>→ {shortDate(fromToday, data.today)}</strong>
          </button>
        </div>

        <div className="form-row">
          <Field label="收款金额（元）" hint={unit ? `${centsToInput(unit)} 元/月 × ${months}` : undefined}>
            <input
              className="input"
              inputMode="decimal"
              value={shownAmount}
              onChange={(e) => {
                setAmountTouched(true);
                setAmount(e.target.value);
              }}
            />
          </Field>
          <Field label="收款日期">
            <input className="input" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} required />
          </Field>
        </div>
        <Field label="备注">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="可选" />
        </Field>
        {error && <p className="form-error">{error}</p>}
      </form>
    </Modal>
  );
}
