import { useState, type FormEvent } from "react";
import { KINDS, type Kind, type Subscription } from "../../shared/types";
import { api, errorMessage } from "../lib/api";
import { KIND_META, centsToInput, parseYuan } from "../lib/format";
import { navigate } from "../lib/router";
import { useApp } from "../lib/store";
import { Field, Modal } from "./ui";

const DEFAULT_NAMES: Record<Kind, string> = {
  spotify: "Spotify 家庭版",
  apple_music: "Apple Music 家庭版",
  youtube: "YouTube 家庭版",
  netflix: "Netflix",
  other: "",
};

export function SubscriptionForm({ sub, onClose }: { sub?: Subscription; onClose: () => void }) {
  const { reload, toast } = useApp();
  const [kind, setKind] = useState<Kind>(sub?.kind ?? "spotify");
  const [name, setName] = useState(sub?.name ?? DEFAULT_NAMES.spotify);
  const [maxMembers, setMaxMembers] = useState(String(sub?.max_members ?? 5));
  const [price, setPrice] = useState(centsToInput(sub?.price_cents ?? null));
  const [note, setNote] = useState(sub?.note ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function changeKind(k: Kind) {
    // 名称还是默认值时，跟着类型一起改
    if (!name.trim() || Object.values(DEFAULT_NAMES).includes(name)) setName(DEFAULT_NAMES[k]);
    setKind(k);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const priceCents = parseYuan(price) ?? 0;
    if (Number.isNaN(priceCents)) return setError("价格格式不对，例如 15 或 12.5");
    const body = {
      kind,
      name,
      max_members: Number(maxMembers),
      price_cents: priceCents,
      note,
    };
    setBusy(true);
    setError("");
    try {
      const saved = sub
        ? await api<Subscription>(`/subscriptions/${sub.id}`, { method: "PUT", body })
        : await api<Subscription>("/subscriptions", { body });
      await reload();
      if (!sub) navigate(`/subs/${saved.id}`);
      toast(sub ? "已保存" : "已添加订阅");
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={sub ? "编辑订阅" : "添加订阅"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" form="sub-form" disabled={busy}>
            {busy ? "保存中…" : "保存"}
          </button>
        </>
      }
    >
      <form id="sub-form" className="form" onSubmit={submit}>
        <Field label="类型">
          <div className="chips">
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                className={kind === k ? "chip chip-active" : "chip"}
                onClick={() => changeKind(k)}
              >
                {KIND_META[k].label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="名称" hint="有多个同类计划时可以加编号区分，比如 “Spotify 家庭版 2 号”">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={50} />
        </Field>
        <div className="form-row">
          <Field label="可售名额">
            <input
              className="input"
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              value={maxMembers}
              onChange={(e) => setMaxMembers(e.target.value)}
              required
            />
          </Field>
          <Field label="默认价格（元/人/月）">
            <input
              className="input"
              inputMode="decimal"
              placeholder="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </Field>
        </div>
        <Field label="备注" hint="比如主账号、家庭组邀请链接、自己的续费日期等">
          <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
        </Field>
        {error && <p className="form-error">{error}</p>}
      </form>
    </Modal>
  );
}
