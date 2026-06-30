"use client";

import { useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        const params = new URLSearchParams(window.location.search);
        window.location.href = params.get("next") || "/dashboard";
        return;
      }
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Login failed");
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 380, margin: "16vh auto", padding: "0 24px" }}>
      <h1 style={{ fontWeight: 600, marginBottom: 4 }}>FABRIOZA CRM</h1>
      <p style={{ color: "#6b726d", marginTop: 0 }}>Internal dashboard — sign in.</p>
      <form onSubmit={submit}>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Dashboard password"
          autoFocus
          style={{
            width: "100%",
            padding: "12px 14px",
            border: "1px solid #d7ddd6",
            borderRadius: 8,
            fontSize: 15,
            boxSizing: "border-box",
          }}
        />
        {error && <p style={{ color: "#b3261e", fontSize: 14 }}>{error}</p>}
        <button
          type="submit"
          disabled={busy}
          style={{
            marginTop: 12,
            width: "100%",
            padding: "12px 14px",
            background: "#4A7C59",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 15,
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
