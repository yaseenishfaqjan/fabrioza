// Typed data-access layer for leads. Server-only (uses the admin DB client).
// Phases 2-5 call these functions; no other module should touch the table directly.

import { getDb } from "@/lib/db";
import type {
  Lead,
  LeadAiUpdate,
  LeadIntent,
  LeadStatus,
  NewLeadInput,
} from "@/types/lead";

const TABLE = "leads";

/** Insert a new lead (status defaults to 'new'). Returns the created row. */
export async function createLead(input: NewLeadInput): Promise<Lead> {
  const db = getDb();
  const { data, error } = await db
    .from(TABLE)
    .insert({
      source: input.source,
      name: input.name ?? null,
      email: input.email ?? null,
      company: input.company ?? null,
      product_type: input.product_type ?? null,
      quantity: input.quantity ?? null,
      message: input.message ?? null,
      raw_content: input.raw_content ?? null,
    })
    .select("*")
    .single();

  if (error) throw new Error(`createLead failed: ${error.message}`);
  return data as Lead;
}

/**
 * Insert a lead only if `dedupeKey` hasn't been seen before (email intake, Phase 3).
 * Uses upsert with ignoreDuplicates so a repeated Message-ID is a no-op.
 * Returns { created: false } when the lead already existed.
 */
export async function createLeadDedup(
  input: NewLeadInput,
  dedupeKey: string
): Promise<{ created: boolean; id?: string }> {
  const db = getDb();
  const { data, error } = await db
    .from(TABLE)
    .upsert(
      {
        source: input.source,
        name: input.name ?? null,
        email: input.email ?? null,
        company: input.company ?? null,
        product_type: input.product_type ?? null,
        quantity: input.quantity ?? null,
        message: input.message ?? null,
        raw_content: input.raw_content ?? null,
        dedupe_key: dedupeKey,
      },
      { onConflict: "dedupe_key", ignoreDuplicates: true }
    )
    .select("id");

  if (error) throw new Error(`createLeadDedup failed: ${error.message}`);
  if (data && data.length > 0) return { created: true, id: data[0].id as string };
  return { created: false };
}

/** Fetch a single lead by id, or null if not found. */
export async function getLead(id: string): Promise<Lead | null> {
  const db = getDb();
  const { data, error } = await db.from(TABLE).select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`getLead failed: ${error.message}`);
  return (data as Lead) ?? null;
}

export interface ListLeadsOptions {
  status?: LeadStatus;
  intent?: LeadIntent;
  limit?: number;
  offset?: number;
}

/** List leads, newest first, with optional status/intent filters + pagination. */
export async function listLeads(opts: ListLeadsOptions = {}): Promise<Lead[]> {
  const db = getDb();
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);

  let query = db
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (opts.status) query = query.eq("status", opts.status);
  if (opts.intent) query = query.eq("ai_intent", opts.intent);

  const { data, error } = await query;
  if (error) throw new Error(`listLeads failed: ${error.message}`);
  return (data as Lead[]) ?? [];
}

/** Write AI enrichment (summary, intent, suggested reply) onto a lead (Phase 4). */
export async function applyAiEnrichment(
  id: string,
  ai: LeadAiUpdate
): Promise<Lead> {
  const db = getDb();
  const { data, error } = await db
    .from(TABLE)
    .update({
      ai_summary: ai.ai_summary,
      ai_intent: ai.ai_intent,
      ai_suggested_reply: ai.ai_suggested_reply,
      status: ai.status ?? "drafted",
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(`applyAiEnrichment failed: ${error.message}`);
  return data as Lead;
}

/**
 * Store a safe fallback reply when AI analysis failed (Phase 4).
 * Leaves ai_intent NULL and keeps status as 'new' so the lead is never lost
 * and is clearly flagged for manual review.
 */
export async function storeAiFallback(id: string, reply: string): Promise<void> {
  const db = getDb();
  const { error } = await db
    .from(TABLE)
    .update({
      ai_summary: "Automatic analysis unavailable — needs manual review.",
      ai_suggested_reply: reply,
      // ai_intent left NULL; status intentionally left as 'new'
    })
    .eq("id", id);
  if (error) throw new Error(`storeAiFallback failed: ${error.message}`);
}

/** Update the edited reply and/or status (Phase 5 dashboard actions). */
export async function updateLead(
  id: string,
  patch: Partial<Pick<Lead, "ai_suggested_reply" | "status">>
): Promise<Lead> {
  const db = getDb();
  const { data, error } = await db
    .from(TABLE)
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(`updateLead failed: ${error.message}`);
  return data as Lead;
}
