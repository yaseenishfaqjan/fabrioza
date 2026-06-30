// Gmail draft creation via the REST API (zero extra dependencies).
// Exchanges the refresh token for a short-lived access token, builds an
// RFC-822 message, and creates a DRAFT in the authenticated account
// (fabriozadotcom@gmail.com). From = the authenticated account; no "send as".
// DRAFT ONLY — nothing is ever sent.

export interface DraftInput {
  to: string;
  subject: string;
  body: string;
}

function requireGmailEnv(): { id: string; secret: string; refresh: string } {
  const id = process.env.GMAIL_CLIENT_ID;
  const secret = process.env.GMAIL_CLIENT_SECRET;
  const refresh = process.env.GMAIL_REFRESH_TOKEN;
  if (!id || !secret || !refresh) {
    throw new Error(
      "Gmail not configured — set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and GMAIL_REFRESH_TOKEN in .env.local."
    );
  }
  return { id, secret, refresh };
}

async function getAccessToken(): Promise<string> {
  const { id, secret, refresh } = requireGmailEnv();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      refresh_token: refresh,
      grant_type: "refresh_token",
    }).toString(),
  });
  const json: { access_token?: string; error?: string; error_description?: string } =
    await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(
      `Gmail authorization failed: ${json.error ?? res.status} ${json.error_description ?? ""}`.trim()
    );
  }
  return json.access_token;
}

function toBase64Url(s: string): string {
  return Buffer.from(s, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** RFC 2047 encode a header value if it contains non-ASCII characters. */
function encodeHeader(s: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(s)) return s;
  return "=?UTF-8?B?" + Buffer.from(s, "utf8").toString("base64") + "?=";
}

export async function createGmailDraft(input: DraftInput): Promise<{ id: string }> {
  const accessToken = await getAccessToken();
  const headers = [
    `To: ${input.to}`,
    `Subject: ${encodeHeader(input.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
  ];
  const raw = toBase64Url(headers.join("\r\n") + "\r\n\r\n" + input.body);

  const res = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: { raw } }),
    }
  );
  const json: { id?: string; error?: { message?: string } } = await res.json();
  if (!res.ok || !json.id) {
    throw new Error(`Gmail draft failed: ${json.error?.message ?? res.status}`);
  }
  return { id: json.id };
}
