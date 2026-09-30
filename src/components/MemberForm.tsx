import { useState, type FormEvent } from "react";
import { addMonths } from "../../shared/dates";
import type { Member } from "../../shared/types";
import { api, errorMessage } from "../lib/api";
import { centsToInput, parseYuan, shortDate, yuan } from "../lib/format";
import { useApp } from "../lib/store";
import { Field, Modal, MonthPicker } from "./ui";

export function MemberForm(props: { member?: Member; subscriptionId?: number; onClose: () => void }) {
  const { member, onClose } = props;
  const { data, subsById, reload, toast, openMember } = useApp();
  const [subId, setSubId] = useState(member?.subscription_id ?? props.subscriptionId ?? data.subscriptions[0]?.id);
  const [name, setName] = useState(member?.name ?? "");
  const [contact, setContact] = useState(member?.contact ?? "");
  const [account, setAccount] = useState(member?.account ?? "");
  const [price, setPrice] = useState(centsToInput(member?.price_cents));
  const [note, setNote] = useState(member?.note ?? "");
  // 新增成员：按月数（会记一笔收款）或直接填到期日（从旧平台迁移时用）
  const [mode, setMode] = useState<"months" | "date">("months");
  const [startDate, setStartDate] = useState(data.today);
  const [months, setMonths] = useState(1);
  const [amount, setAmount] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [expiresAt, setExpiresAt] = useState(member?.expires_at ?? data.today);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const sub = subId ? subsById.get(subId) : undefined;
  const parsedPrice = parseYuan(price);
  const unitPrice = parsedPrice === null || Number.isNaN(parsedPrice) ? (sub?.price_cents ?? 0) : parsedPrice;
  const autoAmount = centsToInput(unitPrice * months);
  const used = data.members.filter((m) => m.subscription_id === subId && !m.archived && m.id !== member?.id).length;
  const full = !!sub && used >= sub.max_members;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!subId) return setError("请先添加一个订阅");
    if (Number.isNaN(parsedPrice)) return setError("单独定价格式不对，例如 15 或 12.5");
    const body: Record<string, unknown> = {
      subscription_id: subId,
      name,
      contact,
      account,
      price_cents: parsedPrice,
      note,
    };
    if (member) {
      body.expires_at = expiresAt;
    } else if (mode === "months") {
      const amountCents = parseYuan(amountTouched ? amount : autoAmount) ?? 0;
      if (Number.isNaN(amountCents)) return setError("金额格式不对");
      body.initial = { start_date: startDate, months, amount_cents: amountCents };
    } else {
      body.expires_at = expiresAt;
    }
    setBusy(true);
    setError("");
    try {
      const saved = member
        ? await api<Member>(`/members/${member.id}`, { method: "PUT", body })
        : await api<Member>("/members", { body });
      await reload();
      toast(member ? "已保存" : `已添加 ${saved.name}`);
      onClose();
      if (!member) openMember(saved.id);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={member ? "编辑成员" : "添加成员"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" form="member-form" disabled={busy}>
            {busy ? "保存中…" : "保存"}
          </button>
        </>
      }
    >
      <form id="member-form" className="form" onSubmit={submit}>
        <div className="form-row">
          <Field label="所属订阅" hint={full ? `这个订阅的 ${sub?.max_members} 个名额已经满了` : undefined}>
            <select className="input select" value={subId} onChange={(e) => setSubId(Number(e.target.value))}>
              {data.subscriptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="名称">
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="昵称或备注名"
              required
              maxLength={50}
              autoFocus={!member}
            />
          </Field>
        </div>
        <div className="form-row">
          <Field label="联系方式">
            <input
              className="input"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="微信 / QQ / 手机号"
              maxLength={200}
            />
          </Field>
          <Field label="账号">
            <input
              className="input"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder="对方的 Spotify / Apple ID 邮箱"
              maxLength={200}
            />
          </Field>
        </div>
        <Field label="单独定价（元/月）" hint={`不填则使用订阅默认价格 ${yuan(sub?.price_cents ?? 0)}/月`}>
          <input
            className="input"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder={centsToInput(sub?.price_cents ?? 0)}
          />
        </Field>

        {member ? (
          <Field label="到期日" hint="续费请用“续费”按钮，这里只用来手动修正日期">
            <input
              className="input"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              required
            />
          </Field>
        ) : (
          <>
            <div className="segmented">
              <button
                type="button"
                className={mode === "months" ? "active" : ""}
                onClick={() => setMode("months")}
              >
                按月数（记一笔收款）
              </button>
              <button type="button" className={mode === "date" ? "active" : ""} onClick={() => setMode("date")}>
                直接填到期日
              </button>
            </div>
            {mode === "months" ? (
              <>
                <MonthPicker value={months} onChange={setMonths} />
                <div className="form-row">
                  <Field label="开始日期">
                    <input
                      className="input"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      required
                    />
                  </Field>
                  <Field label="收款金额（元）">
                    <input
                      className="input"
                      inputMode="decimal"
                      value={amountTouched ? amount : autoAmount}
                      onChange={(e) => {
                        setAmountTouched(true);
                        setAmount(e.target.value);
                      }}
                    />
                  </Field>
                </div>
                {startDate && (
                  <p className="preview">
                    到期日：<strong>{shortDate(addMonths(startDate, months), data.today)}</strong>
                  </p>
                )}
              </>
            ) : (
              <Field label="到期日" hint="适合录入之前已经付过钱的成员，不会产生收款记录">
                <input
                  className="input"
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  required
                />
              </Field>
            )}
          </>
        )}

        <Field label="备注">
          <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
        </Field>
        {error && <p className="form-error">{error}</p>}
      </form>
    </Modal>
  );
}
