-- ==================================================================
-- FABRIOZA CRM — leads table  (Phase 1)
-- Run this in Supabase: Dashboard → SQL Editor → New query → Run.
-- ==================================================================

create extension if not exists "pgcrypto";  -- for gen_random_uuid()

create table if not exists public.leads (
  id                 uuid primary key default gen_random_uuid(),
  source             text not null check (source in ('form', 'email')),

  -- contact / enquiry details
  name               text,
  email              text,
  company            text,
  product_type       text,
  quantity           text,                 -- text: real quantities are messy ("150-200", "~500")
  message            text,
  raw_content        text,                 -- full original payload / raw email body

  -- AI-derived fields (filled in Phase 4)
  ai_summary         text,
  ai_intent          text check (ai_intent in ('hot', 'warm', 'cold', 'spam')),
  ai_suggested_reply text,

  -- workflow
  status             text not null default 'new'
                       check (status in ('new', 'drafted', 'sent', 'won', 'lost')),

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- helpful indexes for the dashboard
create index if not exists leads_status_idx     on public.leads (status);
create index if not exists leads_created_at_idx on public.leads (created_at desc);
create index if not exists leads_email_idx      on public.leads (email);
create index if not exists leads_intent_idx     on public.leads (ai_intent);

-- keep updated_at fresh on every update
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------
-- Security: lock the table down. The app connects with the SERVICE
-- ROLE key (server-side only), which bypasses RLS. Enabling RLS with
-- NO policies means anon/public keys can read/write NOTHING.
-- ------------------------------------------------------------------
alter table public.leads enable row level security;
-- (no policies created on purpose → only service role can touch this table)

comment on table public.leads is 'FABRIOZA CRM leads. Server-only access via service role key.';
