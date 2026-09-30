import { useState, type FormEvent } from "react";
import { api, errorMessage } from "../lib/api";

export function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/auth/login", { body: { password } });
      onLogin();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="login-card card" onSubmit={submit}>
        <img src="/favicon.svg" alt="" width="56" height="56" />
        <h1>订阅管理</h1>
        <p className="muted">请输入管理密码</p>
        {/* 隐藏的用户名字段，方便浏览器和密码管理器记住密码 */}
        <input type="text" name="username" autoComplete="username" value="admin" readOnly hidden />
        <input
          className="input"
          type="password"
          name="password"
          autoComplete="current-password"
          placeholder="密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          required
        />
        {error && <p className="form-error">{error}</p>}
        <button className="btn btn-primary btn-block" disabled={busy || !password}>
          {busy ? "登录中…" : "登录"}
        </button>
      </form>
    </div>
  );
}
