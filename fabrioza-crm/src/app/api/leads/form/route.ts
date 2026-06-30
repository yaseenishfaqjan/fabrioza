// POST /api/leads/form
// Receives a website contact-form submission, validates + sanitizes it,
// and stores it as a new lead (source='form', status='new').
// Auth: shared secret via the `x-api-key` header (must equal FORM_INTAKE_SECRET).
// NO AI call here — enrichment happens in Phase 4.

import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { normalizeFormLead } from "@/lib/validation";
import { createLead } from "@/lib/leads";
import { enrichLead } from "@/agent/enrich";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Constant-time string comparison (avoids timing attacks on the secret). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Read a value from the payload by any of several key spellings (case/space-insensitive). */
function field(map: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    const norm = k.toLowerCase().replace(/[\s_-]/g, "");
    if (norm in map) return map[norm];
  }
  return undefined;
}

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function POST(req: Request) {
  // 1) Auth — never reveal whether it was the env or the header that was wrong.
  const secret = process.env.FORM_INTAKE_SECRET;
  if (!secret) {
    console.error("[leads/form] FORM_INTAKE_SECRET is not set");
    return json(500, { ok: false, error: "Server not configured" });
  }
  const provided = req.headers.get("x-api-key") ?? "";
  if (!provided || !safeEqual(provided, secret)) {
    return json(401, { ok: false, error: "Unauthorized" });
  }

  // 2) Parse body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return json(400, { ok: false, error: "Body must be a JSON object" });
  }

  // 3) Map the website payload → NewLeadInput (keys matched case/space-insensitively).
  const map: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    map[k.toLowerCase().replace(/[\s_-]/g, "")] = v;
  }

  const candidate = {
    source: "form" as const,
    name: field(map, "name"),
    email: field(map, "email"),
    company: field(map, "company"),
    product_type: field(map, "product_type", "producttype"),
    quantity: field(map, "quantity", "qty"),
    message: field(map, "message", "comments", "details"),
    // Keep the entire original submission (incl. Form Type / Source / Date) so nothing is lost.
    raw_content: JSON.stringify(body),
  };

  // 4) Validate + sanitize (Phase 1).
  const result = normalizeFormLead(candidate);
  if (!result.ok) {
    return json(400, { ok: false, error: result.error });
  }

  // 5) Store. status defaults to 'new' in the DB.
  try {
    const lead = await createLead(result.data);
    // 6) AI enrichment (Phase 4). enrichLead never throws — a model/network
    //    failure leaves the lead safely stored (status 'new'); it won't fail the response.
    await enrichLead(lead.id);
    return json(201, { ok: true, id: lead.id });
  } catch (err) {
    console.error("[leads/form] createLead failed:", err);
    return json(500, { ok: false, error: "Internal error" });
  }
}
