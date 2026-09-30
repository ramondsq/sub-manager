import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Backup, NotifyLogEntry, Settings } from "../../shared/types";
import { IconBell, IconDownload, IconLogout, IconUpload } from "../components/icons";
import { Field } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { useApp } from "../lib/store";

interface Digest {
  title: string;
  body: string;
  count: number;
}

const LOG_STATUS: Record<NotifyLogEntry["status"], string> = {
  sent: "已推送",
  empty: "无需提醒",
  failed: "推送失败",
};

export function SettingsPage() {
  const { reload, toast, logout } = useApp();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [preview, setPreview] = useState<Digest | null>(null);
  const [log, setLog] = useState<NotifyLogEntry[]>([]);
  const [busy, setBusy] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadExtras() {
    const [p, l] = await Promise.all([api<Digest>("/notify/preview"), api<NotifyLogEntry[]>("/notify/log")]);
    setPreview(p);
    setLog(l);
  }

  useEffect(() => {
    api<Settings>("/settings")
      .then((s) => setSettings({ ...s, app_url: s.app_url || location.origin }))
      .catch((err) => toast(errorMessage(err), "error"));
    loadExtras().catch(() => {});
  }, [toast]);

  if (!settings) return <p className="muted">加载中…</p>;

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setSettings({ ...settings, [key]: value });

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    try {
      await fn();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy("");
    }
  }

  const save = (e: FormEvent) => {
    e.preventDefault();
    void run("save", async () => {
      const saved = await api<Settings>("/settings", { method: "PUT", body: settings });
      setSettings(saved);
      await Promise.all([reload(), loadExtras()]);
      toast("设置已保存");
    });
  };

  const test = () =>
    run("test", async () => {
      await api("/notify/test", { body: { bark_url: settings.bark_url, app_url: settings.app_url } });
      toast("测试通知已发送，请查看手机");
    });

  const pushNow = () =>
    run("push", async () => {
      const r = await api<{ sent: boolean; message: string }>("/notify/run", { body: {} });
      toast(r.message);
    });

  const exportData = () =>
    run("export", async () => {
      const backup = await api<Backup>("/export");
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sub-manager-backup-${backup.exported_at.slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

  const importData = (file: File) =>
    run("import", async () => {
      let backup: Backup;
      try {
        backup = JSON.parse(await file.text()) as Backup;
      } catch {
        throw new Error("文件不是有效的 JSON");
      }
      if (backup.app !== "sub-manager") throw new Error("不是本应用导出的备份文件");
      const ok = confirm(
        `将用备份（${backup.exported_at.slice(0, 10)}，${backup.subscriptions.length} 个订阅、${backup.members.length} 个成员）覆盖当前所有数据，确定吗？`,
      );
      if (!ok) return;
      await api("/import", { body: backup });
      await reload();
      toast("导入完成");
    });

  return (
    <>
      <header className="page-header">
        <div>
          <h1>设置</h1>
          <p className="muted">推送通知、提醒模板和数据备份</p>
        </div>
      </header>

      <form className="card form settings-card" onSubmit={save}>
        <h2 className="card-title">
          <IconBell /> Bark 推送
        </h2>
        <Field
          label="Bark 地址"
          hint={
            <>
              在 iPhone 上安装{" "}
              <a href="https://apps.apple.com/app/bark-customed-notifications/id1403753865" target="_blank" rel="noreferrer">
                Bark
              </a>
              ，打开后复制形如 https://api.day.app/xxxxxx 的地址粘贴到这里。留空则不推送。
            </>
          }
        >
          <input
            className="input"
            value={settings.bark_url}
            onChange={(e) => set("bark_url", e.target.value)}
            placeholder="https://api.day.app/你的key"
            autoComplete="off"
          />
        </Field>
        <div className="form-row">
          <Field label="每天推送时间">
            <select
              className="input select"
              value={settings.notify_hour}
              onChange={(e) => set("notify_hour", Number(e.target.value))}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}:00
                </option>
              ))}
            </select>
          </Field>
          <Field label="时区">
            <input className="input" value={settings.timezone} onChange={(e) => set("timezone", e.target.value)} />
          </Field>
        </div>
        <Field label="提醒天数" hint="到期前几天提醒，用逗号分隔。0 = 到期当天，负数 = 过期后第几天。例如 7,3,1,0,-1,-3">
          <input className="input" value={settings.remind_days} onChange={(e) => set("remind_days", e.target.value)} />
        </Field>
        <Field label="网站地址" hint="点击推送通知时打开这个地址">
          <input className="input" value={settings.app_url} onChange={(e) => set("app_url", e.target.value)} />
        </Field>

        <h2 className="card-title">催费消息模板</h2>
        <Field
          label="模板"
          hint="成员详情里点“复制提醒”时使用。可用变量：{name} 名称、{subscription} 订阅、{date} 到期日、{status} 状态（如“3 天后到期”）、{days} 剩余天数、{price} 每月价格"
        >
          <textarea
            className="input"
            rows={3}
            value={settings.reminder_template}
            onChange={(e) => set("reminder_template", e.target.value)}
          />
        </Field>

        <div className="form-actions">
          <button type="button" className="btn" onClick={test} disabled={!settings.bark_url || !!busy}>
            {busy === "test" ? "发送中…" : "发送测试通知"}
          </button>
          <button className="btn btn-primary" disabled={!!busy}>
            {busy === "save" ? "保存中…" : "保存设置"}
          </button>
        </div>
      </form>

      <section className="card">
        <h2 className="card-title">今天的提醒</h2>
        {preview?.count ? (
          <>
            <p>
              <strong>{preview.title}</strong>
            </p>
            <pre className="digest">{preview.body}</pre>
          </>
        ) : (
          <p className="muted">按当前设置，今天没有需要提醒的成员。</p>
        )}
        <div className="form-actions">
          <button className="btn" onClick={pushNow} disabled={!preview?.count || !!busy}>
            {busy === "push" ? "推送中…" : "立即推送"}
          </button>
        </div>
        {log.length > 0 && (
          <>
            <h3 className="section-title">最近的自动推送</h3>
            <ul className="log">
              {log.map((l) => (
                <li key={l.day}>
                  <span>{l.day}</span>
                  <span className={`badge ${l.status === "failed" ? "badge-expired" : "badge-muted"}`}>
                    {LOG_STATUS[l.status] ?? l.status}
                  </span>
                  {l.status === "failed" && <span className="muted log-detail">{l.detail}</span>}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="card">
        <h2 className="card-title">数据备份</h2>
        <p className="muted">导出全部订阅、成员、收款记录和设置为 JSON 文件。建议定期导出一份保存。</p>
        <div className="form-actions">
          <button className="btn" onClick={() => fileRef.current?.click()} disabled={!!busy}>
            <IconUpload /> {busy === "import" ? "导入中…" : "从备份恢复"}
          </button>
          <button className="btn" onClick={exportData} disabled={!!busy}>
            <IconDownload /> 导出备份
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void importData(file);
            }}
          />
        </div>
      </section>

      <section className="card">
        <button className="btn btn-danger-soft" onClick={() => void logout()}>
          <IconLogout /> 退出登录
        </button>
      </section>
    </>
  );
}
