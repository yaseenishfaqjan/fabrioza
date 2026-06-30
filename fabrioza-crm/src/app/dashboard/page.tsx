"use client";

import { useCallback, useEffect, useState } from "react";

type Lead = {
  id: string;
  source: "form" | "email";
  name: string | null;
  email: string | null;
  company: string | null;
  product_type: string | null;
  quantity: string | null;
  message: string | null;
  raw_content: string | null;
  ai_summary: string | null;
  ai_intent: "hot" | "warm" | "cold" | "spam" | null;
  ai_suggested_reply: string | null;
  status: "new" | "drafted" | "sent" | "won" | "lost";
  created_at: string;
};

const INTENT_COLORS: Record<string, string> = {
  hot: "#b3261e",
  warm: "#b9770e",
  cold: "#5f6b63",
  spam: "#3a3a3a",
};
const STATUSES = ["new", "drafted", "sent", "won", "lost"] as const;

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span
      style={{
        background: color,
        color: "#fff",
        fontSize: 11,
        fontWeight: 600,
        textTransform: "uppercase",
        padding: "2px 8px",
        borderRadius: 20,
        letterSpacing: 0.3,
      }}
    >
      {text}
    </span>
  );
}

export default function Dashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [intent, setIntent] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState("Re: your FABRIOZA enquiry");
  const [reply, setReply] = useState("");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (intent) qs.set("intent", intent);
    if (status) qs.set("status", status);
    const res = await fetch("/api/admin/leads?" + qs.toString());
    if (res.status === 401) {
      window.location.href = "/login?next=/dashboard";
      return;
    }
    const j = await res.json().catch(() => ({ leads: [] }));
    setLeads(j.leads || []);
    setLoading(false);
  }, [intent, status]);

  useEffect(() => {
    load();
  }, [load]);

  function open(l: Lead) {
    setSelected(l);
    setReply(l.ai_suggested_reply || "");
    setSubject("Re: your FABRIOZA enquiry");
    setMsg(null);
  }

  async function createDraft() {
    if (!selected) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/admin/leads/${selected.id}/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, reply }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setMsg({ text: "Gmail draft created — open Gmail to review & send.", ok: true });
      setSelected({ ...selected, status: "drafted" });
      load();
    } else {
      setMsg({ text: j.error || "Draft failed", ok: false });
    }
  }

  async function setLeadStatus(newStatus: string) {
    if (!selected) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/admin/leads/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setMsg({ text: `Marked ${newStatus}.`, ok: true });
      setSelected({ ...selected, status: newStatus as Lead["status"] });
      load();
    } else {
      setMsg({ text: j.error || "Update failed", ok: false });
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const inputStyle: React.CSSProperties = {
    padding: "8px 10px",
    border: "1px solid #d7ddd6",
    borderRadius: 8,
    fontSize: 14,
  };
  const btn = (bg: string): React.CSSProperties => ({
    padding: "9px 14px",
    background: bg,
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontWeight: 600,
    fontSize: 14,
    cursor: busy ? "default" : "pointer",
    opacity: busy ? 0.6 : 1,
  });

  return (
    <main style={{ maxWidth: 1280, margin: "0 auto", padding: "20px 24px" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontWeight: 600, margin: 0 }}>FABRIOZA CRM — Leads</h1>
        <button onClick={logout} style={{ ...btn("#5f6b63") }}>
          Log out
        </button>
      </header>

      <div style={{ display: "flex", gap: 10, margin: "16px 0", alignItems: "center" }}>
        <select value={intent} onChange={(e) => setIntent(e.target.value)} style={inputStyle}>
          <option value="">All intents</option>
          <option value="hot">Hot</option>
          <option value="warm">Warm</option>
          <option value="cold">Cold</option>
          <option value="spam">Spam</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button onClick={load} style={{ ...inputStyle, cursor: "pointer", background: "#fff" }}>
          ↻ Refresh
        </button>
        <span style={{ color: "#6b726d", fontSize: 14 }}>
          {loading ? "Loading…" : `${leads.length} lead(s)`}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 20 }}>
        {/* LIST */}
        <div style={{ border: "1px solid #e4e8e5", borderRadius: 12, overflow: "hidden" }}>
          {leads.map((l) => (
            <button
              key={l.id}
              onClick={() => open(l)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "12px 14px",
                border: "none",
                borderBottom: "1px solid #eef1ee",
                background: selected?.id === l.id ? "#f0f5f1" : "#fff",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
                <Badge text={l.source} color={l.source === "email" ? "#3b5bdb" : "#0c8599"} />
                {l.ai_intent && <Badge text={l.ai_intent} color={INTENT_COLORS[l.ai_intent]} />}
                <Badge text={l.status} color="#868e96" />
                <span style={{ color: "#9aa39c", fontSize: 12, marginLeft: "auto" }}>
                  {new Date(l.created_at).toLocaleString()}
                </span>
              </div>
              <div style={{ fontWeight: 600, color: "#1d1f1e" }}>
                {l.name || "(no name)"}{" "}
                <span style={{ color: "#6b726d", fontWeight: 400 }}>{l.email || ""}</span>
              </div>
              {l.company && <div style={{ fontSize: 13, color: "#6b726d" }}>{l.company}</div>}
              <div style={{ fontSize: 13, color: "#3a403c", marginTop: 4 }}>
                {l.ai_summary || l.message?.slice(0, 120) || ""}
              </div>
            </button>
          ))}
          {!loading && leads.length === 0 && (
            <div style={{ padding: 20, color: "#6b726d" }}>No leads match these filters.</div>
          )}
        </div>

        {/* DETAIL */}
        <div style={{ border: "1px solid #e4e8e5", borderRadius: 12, padding: 18, alignSelf: "start" }}>
          {!selected ? (
            <p style={{ color: "#6b726d" }}>Select a lead to review and draft a reply.</p>
          ) : (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                <Badge text={selected.source} color={selected.source === "email" ? "#3b5bdb" : "#0c8599"} />
                {selected.ai_intent && (
                  <Badge text={selected.ai_intent} color={INTENT_COLORS[selected.ai_intent]} />
                )}
                <Badge text={selected.status} color="#868e96" />
              </div>
              <h3 style={{ margin: "0 0 4px" }}>{selected.name || "(no name)"}</h3>
              <div style={{ fontSize: 14, color: "#3a403c" }}>{selected.email || "(no email)"}</div>
              {selected.company && <div style={{ fontSize: 14, color: "#6b726d" }}>{selected.company}</div>}
              <div style={{ fontSize: 13, color: "#6b726d", margin: "6px 0" }}>
                {selected.product_type ? `Product: ${selected.product_type}` : ""}{" "}
                {selected.quantity ? ` · Qty: ${selected.quantity}` : ""}
              </div>

              {selected.ai_summary && (
                <p style={{ background: "#f6f8f6", padding: "10px 12px", borderRadius: 8, fontSize: 14 }}>
                  <strong>AI summary:</strong> {selected.ai_summary}
                </p>
              )}

              <details style={{ margin: "8px 0" }}>
                <summary style={{ cursor: "pointer", color: "#4A7C59", fontSize: 14 }}>
                  View original message / raw content
                </summary>
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    background: "#fafcfa",
                    border: "1px solid #eef1ee",
                    borderRadius: 8,
                    padding: 12,
                    fontSize: 12.5,
                    maxHeight: 260,
                    overflow: "auto",
                  }}
                >
                  {selected.message || selected.raw_content || "(empty)"}
                </pre>
              </details>

              <label style={{ fontSize: 13, fontWeight: 600 }}>Subject</label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                style={{ ...inputStyle, width: "100%", boxSizing: "border-box", margin: "4px 0 12px" }}
              />

              <label style={{ fontSize: 13, fontWeight: 600 }}>Reply (editable)</label>
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={12}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  margin: "4px 0 12px",
                  padding: 12,
                  border: "1px solid #d7ddd6",
                  borderRadius: 8,
                  fontSize: 14,
                  fontFamily: "inherit",
                  lineHeight: 1.5,
                }}
              />

              {msg && (
                <p style={{ color: msg.ok ? "#2b8a3e" : "#b3261e", fontSize: 14 }}>{msg.text}</p>
              )}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={createDraft} disabled={busy} style={btn("#4A7C59")}>
                  Create Gmail draft
                </button>
                <button onClick={() => setLeadStatus("sent")} disabled={busy} style={btn("#3b5bdb")}>
                  Mark sent
                </button>
                <button onClick={() => setLeadStatus("won")} disabled={busy} style={btn("#2b8a3e")}>
                  Mark won
                </button>
                <button onClick={() => setLeadStatus("lost")} disabled={busy} style={btn("#868e96")}>
                  Mark lost
                </button>
              </div>
              <p style={{ color: "#9aa39c", fontSize: 12, marginTop: 10 }}>
                “Create Gmail draft” only creates a DRAFT in {`fabriozadotcom@gmail.com`}. Open Gmail to
                review and send — nothing is sent automatically.
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
