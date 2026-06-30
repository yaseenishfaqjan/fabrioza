// Builds an ImapFlow client from environment variables (SSL/TLS).
import { ImapFlow } from "imapflow";

export function buildImapClient(): ImapFlow {
  const host = process.env.IMAP_HOST;
  const user = process.env.IMAP_USER;
  const pass = process.env.IMAP_PASSWORD;
  const port = parseInt(process.env.IMAP_PORT || "993", 10) || 993;
  // IMAP_TLS defaults to true; only the literal string "false" disables it.
  const secure = (process.env.IMAP_TLS ?? "true").toLowerCase() !== "false";

  if (!host || !user || !pass) {
    throw new Error("Missing IMAP_HOST / IMAP_USER / IMAP_PASSWORD in env.");
  }

  return new ImapFlow({
    host,
    port,
    secure,
    auth: { user, pass },
    logger: false, // keep imapflow quiet; we do our own concise logging
  });
}
