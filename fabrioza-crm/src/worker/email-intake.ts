// Standalone background worker: polls IMAP on a loop.
// Run with:  npm run worker:email
// Designed to run as its own container/service (Phase 7 Docker).
//
// - Loads .env.local (same secrets file the Next app uses).
// - Polls every EMAIL_POLL_SECONDS (default 180).
// - Opens a connection, does one cycle, closes — gentle on cPanel limits.
// - Exponential backoff on errors (30s → 15min); NEVER crashes the loop.
// - Graceful shutdown on SIGINT / SIGTERM.

import { config } from "dotenv";
// Load .env.local first (developer/secret file), then .env as a fallback.
config({ path: ".env.local" });
config();

import { pollOnce } from "@/lib/email/intake";

const POLL_SECONDS = (() => {
  const n = parseInt(process.env.EMAIL_POLL_SECONDS || "180", 10);
  return Number.isFinite(n) && n > 0 ? n : 180;
})();

let stopping = false;

function log(...args: unknown[]) {
  console.log(`[${new Date().toISOString()}] [email-worker]`, ...args);
}

/** Sleep that wakes early if a shutdown was requested. */
function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => {
    let elapsed = 0;
    const tick = setInterval(() => {
      elapsed += 1;
      if (stopping || elapsed >= seconds) {
        clearInterval(tick);
        resolve();
      }
    }, 1000);
  });
}

async function main() {
  process.on("SIGINT", () => {
    log("SIGINT received, shutting down after current cycle…");
    stopping = true;
  });
  process.on("SIGTERM", () => {
    log("SIGTERM received, shutting down after current cycle…");
    stopping = true;
  });

  log(`started. polling every ${POLL_SECONDS}s`);
  let backoff = 0;

  while (!stopping) {
    try {
      const r = await pollOnce();
      if (r.firstRun) {
        log("first run — watermarked to current mailbox state, imported 0 (no backfill)");
      } else {
        log(`scanned=${r.scanned} imported=${r.imported} skipped=${r.skipped} errors=${r.errors}`);
      }
      backoff = 0;
      await sleep(POLL_SECONDS);
    } catch (err) {
      // Exponential backoff: 30s, 60s, 120s … capped at 15 min. Never throw out of the loop.
      backoff = backoff ? Math.min(backoff * 2, 900) : 30;
      log(`cycle failed: ${(err as Error)?.message ?? err} — retrying in ${backoff}s`);
      await sleep(backoff);
    }
  }

  log("stopped cleanly.");
  process.exit(0);
}

main().catch((err) => {
  // Last-resort guard — should never reach here because the loop catches errors.
  console.error("[email-worker] fatal:", err);
  process.exit(1);
});
