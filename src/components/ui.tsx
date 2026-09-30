import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Kind } from "../../shared/types";
import { KIND_META, statusText, urgency } from "../lib/format";
import { IconClose } from "./icons";

// 弹窗可能叠在一起（例如成员详情上面再打开续费）：Esc 只关闭最上面的一个，全部关闭后才恢复页面滚动
const modalStack: object[] = [];

export function Modal(props: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { onClose } = props;
  const [token] = useState(() => ({}));
  useEffect(() => {
    modalStack.push(token);
    document.body.classList.add("modal-open");
    return () => {
      modalStack.splice(modalStack.indexOf(token), 1);
      if (!modalStack.length) document.body.classList.remove("modal-open");
    };
  }, [token]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && modalStack[modalStack.length - 1] === token) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, token]);

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true">
        <header className="modal-header">
          <h2>{props.title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
            <IconClose />
          </button>
        </header>
        <div className="modal-body">{props.children}</div>
        {props.footer && <footer className="modal-footer">{props.footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

export function KindLogo({ kind, name, size = 36 }: { kind: Kind; name: string; size?: number }) {
  const meta = KIND_META[kind];
  return (
    <span
      className="kind-logo"
      style={{ background: meta.color, width: size, height: size, fontSize: size * 0.45 }}
      aria-hidden="true"
    >
      {meta.glyph || name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function DaysBadge({ days }: { days: number }) {
  return <span className={`badge badge-${urgency(days)}`}>{statusText(days)}</span>;
}

export function Field(props: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{props.label}</span>
      {props.children}
      {props.hint && <span className="field-hint">{props.hint}</span>}
    </label>
  );
}

export function MonthPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="month-grid" role="radiogroup" aria-label="月数">
      {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          className={value === n ? "chip chip-active" : "chip"}
          onClick={() => onChange(n)}
        >
          {n} 个月
        </button>
      ))}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children}
    </div>
  );
}
