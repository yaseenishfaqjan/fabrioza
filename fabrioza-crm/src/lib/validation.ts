// Input validation + sanitization for incoming leads.
// Every external payload (form POST in Phase 2, parsed email in Phase 3)
// must pass through here before it touches the database.

import { z } from "zod";
import { LEAD_SOURCES } from "@/types/lead";

/** Strip control chars / null bytes, normalize newlines, trim, and cap length. */
export function sanitizeText(value: unknown, maxLen = 5000): string | null {
  if (value === null || value === undefined) return null;
  let s = String(value);
  s = s.replace(/\r\n/g, "\n");
  // remove null bytes and non-printable control chars (keep \n = 0x0A and \t = 0x09)
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  s = s.trim();
  if (s.length === 0) return null;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

/**
 * Raw form payload shape (matches the website form fields).
 * Everything is optional/loose because real submissions are messy;
 * we sanitize rather than reject, except for the source.
 */
export const FormLeadSchema = z.object({
  source: z.enum(LEAD_SOURCES).default("form"),
  name: z.string().max(200).optional().nullable(),
  email: z.string().email().max(320).optional().nullable().catch(null),
  company: z.string().max(200).optional().nullable(),
  product_type: z.string().max(200).optional().nullable(),
  quantity: z.string().max(100).optional().nullable(),
  message: z.string().max(10000).optional().nullable(),
  // form_type / date / extra fields from the site are folded into raw_content
  raw_content: z.string().max(20000).optional().nullable(),
});

export type FormLeadParsed = z.infer<typeof FormLeadSchema>;

/**
 * Normalize an arbitrary inbound object into a clean, DB-ready record.
 * Returns { ok, data } or { ok:false, error }.
 */
export function normalizeFormLead(
  input: unknown
):
  | {
      ok: true;
      data: {
        source: (typeof LEAD_SOURCES)[number];
        name: string | null;
        email: string | null;
        company: string | null;
        product_type: string | null;
        quantity: string | null;
        message: string | null;
        raw_content: string | null;
      };
    }
  | { ok: false; error: string } {
  const parsed = FormLeadSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }
  const v = parsed.data;
  const data = {
    source: v.source ?? ("form" as const),
    name: sanitizeText(v.name, 200),
    email: v.email ? sanitizeText(v.email, 320) : null,
    company: sanitizeText(v.company, 200),
    product_type: sanitizeText(v.product_type, 200),
    quantity: sanitizeText(v.quantity, 100),
    message: sanitizeText(v.message, 10000),
    raw_content: sanitizeText(v.raw_content, 20000),
  };

  // Require at least an email or a message — otherwise it's not a usable lead.
  if (!data.email && !data.message) {
    return { ok: false, error: "Lead must include at least an email or a message." };
  }
  return { ok: true, data };
}
