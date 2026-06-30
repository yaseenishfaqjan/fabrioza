// Core domain types for the FABRIOZA CRM (Phase 1).
// Mirrors the `leads` table in db/schema.sql.

export const LEAD_SOURCES = ["form", "email"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_INTENTS = ["hot", "warm", "cold", "spam"] as const;
export type LeadIntent = (typeof LEAD_INTENTS)[number];

export const LEAD_STATUSES = ["new", "drafted", "sent", "won", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** A full lead row as stored in the database. */
export interface Lead {
  id: string;
  source: LeadSource;
  name: string | null;
  email: string | null;
  company: string | null;
  product_type: string | null;
  quantity: string | null;
  message: string | null;
  raw_content: string | null;
  ai_summary: string | null;
  ai_intent: LeadIntent | null;
  ai_suggested_reply: string | null;
  status: LeadStatus;
  created_at: string;
  updated_at: string;
}

/** Fields accepted when creating a new lead (before AI enrichment). */
export interface NewLeadInput {
  source: LeadSource;
  name?: string | null;
  email?: string | null;
  company?: string | null;
  product_type?: string | null;
  quantity?: string | null;
  message?: string | null;
  raw_content?: string | null;
}

/** AI enrichment fields written back onto a lead (Phase 4). */
export interface LeadAiUpdate {
  ai_summary: string;
  ai_intent: LeadIntent;
  ai_suggested_reply: string;
  status?: LeadStatus; // typically 'drafted'
}
