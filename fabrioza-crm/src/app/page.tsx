// Placeholder home page. The protected review dashboard is built in Phase 5.

export default function Home() {
  return (
    <main style={{ maxWidth: 640, margin: "10vh auto", padding: "0 24px" }}>
      <h1 style={{ fontWeight: 600 }}>FABRIOZA CRM</h1>
      <p style={{ color: "#6b726d", lineHeight: 1.6 }}>
        Internal lead-response system. <strong>Phase 1 (data + storage)</strong> is in
        place: leads table, typed CRUD, and input validation.
      </p>
      <ul style={{ color: "#6b726d", lineHeight: 1.8 }}>
        <li>Phase 2 — form intake API</li>
        <li>Phase 3 — IMAP email intake</li>
        <li>Phase 4 — OpenAI agent enrichment</li>
        <li>Phase 5 — protected review dashboard + Gmail draft</li>
      </ul>
    </main>
  );
}
