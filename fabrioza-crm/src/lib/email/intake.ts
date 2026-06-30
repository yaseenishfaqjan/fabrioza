// Core IMAP poll cycle: connect → fetch new (UID > watermark) → parse →
// filter → de-dupe → createLead → enrich (AI) → advance watermark → close.
// Shared by the background worker and the manual /api/email/poll route.
// Does NOT modify flags, delete/move mail, or auto-reply.

import { simpleParser } from "mailparser";
import { createHash } from "crypto";
import { buildImapClient } from "@/lib/email/client";
import { classifyEmail } from "@/lib/email/filter";
import { getIntakeState, setIntakeState } from "@/lib/email/state";
import { normalizeFormLead } from "@/lib/validation";
import { createLeadDedup } from "@/lib/leads";
import { enrichLead } from "@/agent/enrich";

export interface PollResult {
  scanned: number;
  imported: number;
  skipped: number;
  errors: number;
  firstRun: boolean;
}

export async function pollOnce(): Promise<PollResult> {
  const res: PollResult = { scanned: 0, imported: 0, skipped: 0, errors: 0, firstRun: false };
  const client = buildImapClient();
  await client.connect();

  const lock = await client.getMailboxLock("INBOX");
  try {
    const mb = client.mailbox;
    if (!mb || typeof mb === "boolean") throw new Error("Could not open INBOX");

    const uidValidity = String(mb.uidValidity);
    const highestUid = Number(mb.uidNext) - 1; // highest existing UID
    const state = await getIntakeState();

    // First run, or the mailbox's UIDVALIDITY changed (UIDs reset):
    // watermark to "now" and import nothing. Historical backfill is Phase 6.
    if (!state || state.uidValidity !== uidValidity) {
      await setIntakeState({ uidValidity, lastUid: Math.max(highestUid, 0) });
      res.firstRun = true;
      return res;
    }

    // Nothing newer than what we've already processed.
    if (highestUid <= state.lastUid) return res;

    let maxUid = state.lastUid;
    for await (const msg of client.fetch(
      `${state.lastUid + 1}:*`,
      { uid: true, source: true },
      { uid: true }
    )) {
      res.scanned++;
      if (msg.uid > maxUid) maxUid = msg.uid;

      try {
        const parsed = await simpleParser(msg.source as Buffer);
        const fromEmail = parsed.from?.value?.[0]?.address ?? "";
        const fromName = parsed.from?.value?.[0]?.name ?? "";
        const subject = parsed.subject ?? "";
        const text = parsed.text ?? "";
        const messageId = parsed.messageId ?? "";
        const dateStr = parsed.date ? parsed.date.toISOString() : "";

        const verdict = classifyEmail({ fromEmail, subject, text });
        if (!verdict.keep) {
          res.skipped++;
          continue;
        }

        // De-dupe by Message-ID, fall back to a hash of sender|subject|date.
        const dedupeKey =
          messageId ||
          "h:" + createHash("sha256").update(`${fromEmail}|${subject}|${dateStr}`).digest("hex");

        const norm = normalizeFormLead({
          source: "email",
          name: fromName || null,
          email: fromEmail || null,
          message: text || subject || null,
          raw_content: (msg.source as Buffer).toString("utf8"),
        });
        if (!norm.ok) {
          res.skipped++;
          continue;
        }

        const out = await createLeadDedup(norm.data, dedupeKey);
        if (out.created) {
          res.imported++;
          // AI enrichment (Phase 4) — never throws; failure leaves the lead as 'new'.
          if (out.id) await enrichLead(out.id);
        } else {
          res.skipped++; // duplicate Message-ID → already a lead
        }
      } catch (err) {
        res.errors++;
        console.error(`[intake] uid ${msg.uid} failed:`, (err as Error)?.message);
      }
    }

    // Advance the watermark past everything we looked at (we don't touch flags),
    // so skipped/errored messages aren't re-scanned next cycle.
    await setIntakeState({
      uidValidity,
      lastUid: Math.max(state.lastUid, maxUid, highestUid),
    });
    return res;
  } finally {
    lock.release();
    try {
      await client.logout();
    } catch {
      /* ignore logout errors */
    }
  }
}
