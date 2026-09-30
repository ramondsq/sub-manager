import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Member, Overview, Subscription } from "../shared/types";
import { MemberForm } from "./components/MemberForm";
import { MemberSheet } from "./components/MemberSheet";
import { RenewDialog } from "./components/RenewDialog";
import { SubscriptionForm } from "./components/SubscriptionForm";
import { IconCalendar, IconLayers, IconSettings } from "./components/icons";
import { api, errorMessage, setUnauthorizedHandler } from "./lib/api";
import { navigate, usePath } from "./lib/router";
import { AppContext, type AppContextValue } from "./lib/store";
import { LoginPage } from "./pages/Login";
import { OverviewPage } from "./pages/Overview";
import { SettingsPage } from "./pages/Settings";
import { SubscriptionDetailPage } from "./pages/SubscriptionDetail";
import { SubscriptionsPage } from "./pages/Subscriptions";

export default function App() {
  const [auth, setAuth] = useState<"loading" | "in" | "out">("loading");

  useEffect(() => {
    setUnauthorizedHandler(() => setAuth("out"));
    api<{ authenticated: boolean }>("/auth/me")
      .then((r) => setAuth(r.authenticated ? "in" : "out"))
      .catch(() => setAuth("out"));
  }, []);

  if (auth === "loading") return <div className="splash" />;
  if (auth === "out") return <LoginPage onLogin={() => setAuth("in")} />;
  return <Shell onLogout={() => setAuth("out")} />;
}

type Dialog =
  | { type: "renew"; member: Member }
  | { type: "memberForm"; member?: Member; subscriptionId?: number }
  | { type: "subForm"; sub?: Subscription };

interface Toast {
  id: number;
  message: string;
  tone: "ok" | "error";
}

const NAV = [
  { path: "/", label: "到期", icon: IconCalendar },
  { path: "/subs", label: "订阅", icon: IconLayers },
  { path: "/settings", label: "设置", icon: IconSettings },
];

function Shell({ onLogout }: { onLogout: () => void }) {
  const path = usePath();
  const [data, setData] = useState<Overview | null>(null);
  const [loadError, setLoadError] = useState("");
  const [memberId, setMemberId] = useState<number | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const reload = useCallback(async () => {
    try {
      setData(await api<Overview>("/overview"));
      setLoadError("");
    } catch (err) {
      setLoadError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void reload();
    // 从后台切回来时刷新一下，保证“今天”和到期天数是最新的
    const onVisible = () => document.visibilityState === "visible" && void reload();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload]);

  const toast = useCallback((message: string, tone: "ok" | "error" = "ok") => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 4000 : 2500);
  }, []);

  const ctx = useMemo<AppContextValue | null>(
    () =>
      data && {
        data,
        subsById: new Map(data.subscriptions.map((s) => [s.id, s])),
        reload,
        toast,
        logout: async () => {
          await api("/auth/logout", { method: "POST" }).catch(() => {});
          onLogout();
        },
        openMember: setMemberId,
        openRenew: (member) => setDialog({ type: "renew", member }),
        openMemberForm: (opts) => setDialog({ type: "memberForm", ...opts }),
        openSubscriptionForm: (sub) => setDialog({ type: "subForm", sub }),
      },
    [data, reload, toast, onLogout],
  );

  if (!ctx) {
    return (
      <div className="splash">
        {loadError && (
          <div className="card splash-error">
            <p>{loadError}</p>
            <button className="btn btn-primary" onClick={() => void reload()}>
              重试
            </button>
          </div>
        )}
      </div>
    );
  }

  const subMatch = /^\/subs\/(\d+)$/.exec(path);
  let page;
  if (path === "/subs") page = <SubscriptionsPage />;
  else if (subMatch) page = <SubscriptionDetailPage id={Number(subMatch[1])} />;
  else if (path === "/settings") page = <SettingsPage />;
  else page = <OverviewPage />;

  const closeDialog = () => setDialog(null);
  const isActive = (p: string) => (p === "/" ? path === "/" : path.startsWith(p));

  return (
    <AppContext.Provider value={ctx}>
      <div className="layout">
        <aside className="sidebar">
          <div className="brand">
            <img src="/favicon.svg" alt="" width="28" height="28" />
            <span>订阅管理</span>
          </div>
          <nav>
            {NAV.map(({ path: p, label, icon: I }) => (
              <a
                key={p}
                href={p}
                className={isActive(p) ? "nav-item active" : "nav-item"}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(p);
                }}
              >
                <I />
                {label}
              </a>
            ))}
          </nav>
        </aside>
        <main className="main">{page}</main>
        <nav className="tabbar">
          {NAV.map(({ path: p, label, icon: I }) => (
            <a
              key={p}
              href={p}
              className={isActive(p) ? "tab active" : "tab"}
              onClick={(e) => {
                e.preventDefault();
                navigate(p);
              }}
            >
              <I />
              <span>{label}</span>
            </a>
          ))}
        </nav>
      </div>

      {memberId !== null && <MemberSheet id={memberId} onClose={() => setMemberId(null)} />}
      {dialog?.type === "renew" && <RenewDialog member={dialog.member} onClose={closeDialog} />}
      {dialog?.type === "memberForm" && (
        <MemberForm member={dialog.member} subscriptionId={dialog.subscriptionId} onClose={closeDialog} />
      )}
      {dialog?.type === "subForm" && <SubscriptionForm sub={dialog.sub} onClose={closeDialog} />}

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            {t.message}
          </div>
        ))}
      </div>
    </AppContext.Provider>
  );
}
