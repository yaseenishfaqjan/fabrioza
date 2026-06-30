-- ==================================================================
-- FABRIOZA CRM — Phase 3 migration: email intake de-dup + worker state
-- Run in Supabase SQL Editor (idempotent — safe to re-run).
-- ==================================================================

-- 1) De-dup key on leads.
--    Email leads set this to the Message-ID (or a hash fallback).
--    Form leads leave it NULL. Postgres treats multiple NULLs as
--    distinct, so a plain UNIQUE index allows many form leads while
--    enforcing uniqueness across email leads.
alter table public.leads add column if not exists dedupe_key text;

create unique index if not exists leads_dedupe_key_uidx
  on public.leads (dedupe_key);

-- 2) Worker state: stores the IMAP UID watermark (and UIDVALIDITY) so the
--    worker only fetches messages newer than the last one it processed.
--    NOTE: we never modify IMAP flags, so your inbox read/unread state is
--    left exactly as you have it.
create table if not exists public.worker_state (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

alter table public.worker_state enable row level security;
-- (no policies → service-role only, same as leads)

comment on column public.leads.dedupe_key is 'Message-ID or hash; prevents duplicate email leads.';
comment on table public.worker_state is 'Key/value worker checkpoints (e.g. email_intake UID watermark).';
