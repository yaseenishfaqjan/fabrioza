// ------------------------------------------------------------------
// Email lead filter — decides whether an incoming email is a real
// clothing / apparel / manufacturing enquiry worth creating a lead for.
//
// Deliberately SIMPLE and keyword-based so you can tune it without
// touching any other code. To adjust behaviour, just edit the three
// lists below. A message is kept only if it has >= 1 POSITIVE signal
// and no strong-noise (sender or subject) signal.
// ------------------------------------------------------------------

// Keep the email if any of these appear in the subject or body.
const POSITIVE_KEYWORDS = [
  "clothing", "apparel", "garment", "manufactur", "factory", "supplier", "wholesale",
  "hoodie", "t-shirt", "tshirt", "tee", "sweatshirt", "jogger", "tracksuit",
  "sportswear", "activewear", "gym wear", "compression",
  "uniform", "jersey", "team kit", "teamwear",
  "streetwear",
  "private label", "white label", "oem", "odm",
  "sublimation", "embroidery", "screen print", "dtg", "dtf", "heat transfer",
  "cut and sew", "cut & sew", "tech pack", "pattern",
  "moq", "minimum order", "sample", "bulk order", "quote", "pricing",
  "custom", "fabric", "gsm", "sizes", "quantity", "pieces", " pcs", "units",
];

// Skip immediately if the SENDER address contains any of these.
const NOISE_SENDERS = [
  "no-reply", "noreply", "no_reply", "do-not-reply", "donotreply",
  "mailer-daemon", "postmaster", "notifications@", "newsletter@",
  "billing@", "receipts@", "invoice@",
];

// Skip immediately if the SUBJECT contains any of these.
const NOISE_SUBJECTS = [
  "unsubscribe", "newsletter", "receipt", "invoice", "order confirmation",
  "password reset", "verify your", "verification code", "one-time", "otp",
  "delivery failed", "undeliverable", "out of office", "auto-reply",
  "automatic reply", "calendar", "invitation:", "statement", "subscription",
];

export interface FilterInput {
  fromEmail: string;
  subject: string;
  text: string;
}

export interface FilterResult {
  keep: boolean;
  reason: string;
}

export function classifyEmail(input: FilterInput): FilterResult {
  const from = (input.fromEmail || "").toLowerCase();
  const subject = (input.subject || "").toLowerCase();
  const haystack = subject + "\n" + (input.text || "").toLowerCase();

  // 1) Hard noise by sender.
  for (const n of NOISE_SENDERS) {
    if (from.includes(n)) return { keep: false, reason: `noise-sender(${n})` };
  }
  // 2) Hard noise by subject.
  for (const n of NOISE_SUBJECTS) {
    if (subject.includes(n)) return { keep: false, reason: `noise-subject(${n})` };
  }
  // 3) Require at least one apparel/manufacturing signal.
  const hit = POSITIVE_KEYWORDS.find((k) => haystack.includes(k));
  if (!hit) return { keep: false, reason: "no-apparel-keyword" };

  return { keep: true, reason: `match(${hit.trim()})` };
}
