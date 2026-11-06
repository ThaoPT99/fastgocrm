"use client";

import { useState, type FormEvent } from "react";

export default function PasscodeLogin() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/access", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", code }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        setError(body?.error ?? "Chưa đăng nhập được. Hãy thử lại.");
        return;
      }
      window.location.reload();
    } catch {
      setError("Chưa đăng nhập được. Hãy thử lại.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="accessShell">
    <form className="panel accessCard" onSubmit={submit}>
      <div className="eyebrow">FASTGO CRM</div>
      <h1>Đăng nhập</h1>
      <p>Nhập mật mã cá nhân do quản trị viên cấp để vào đúng vai trò của bạn.</p>
      <label>Mật mã<input type="password" required maxLength={100} autoComplete="current-password" value={code}
        onChange={(event) => setCode(event.target.value)} /></label>
      {error && <p className="notice error" role="alert">{error}</p>}
      <button className="primary" disabled={busy}>{busy ? "Đang kiểm tra…" : "Đăng nhập"}</button>
    </form>
  </main>;
}
