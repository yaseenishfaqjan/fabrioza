# FABRIOZA CRM

AI lead-response system + CRM (human-in-the-loop). **Separate** from the marketing
site (`fabrioza-static-routes`) — nothing here touches that project.

Stack: **Next.js 14 (App Router, TypeScript)** + **Supabase (Postgres)**, deployed on
**Vercel**. Replies are **draft-only** — no email is auto-sent without your approval.

## Status: Phase 1 — CRM data + storage ✅

| Area | File |
|---|---|
| DB schema (`leads` table) | `db/schema.sql` |
| Supabase admin client (server-only) | `src/lib/db.ts` |
| Typed CRUD | `src/lib/leads.ts` |
| Validation + sanitization | `src/lib/validation.ts` |
| Domain types | `src/types/lead.ts` |
| Env template | `.env.example` |

Roadmap: Phase 2 form intake → Phase 3 IMAP email intake → Phase 4 OpenAI agent →
Phase 5 protected dashboard + Gmail draft → Phase 6 historical import (later).

## Setup (Phase 1)

1. **Install deps**
   ```bash
   cd fabrioza-crm
   npm install
   ```
2. **Create a Supabase project**, then run the schema: Supabase → SQL Editor → paste
   `db/schema.sql` → Run.
3. **Configure env**
   ```bash
   cp .env.example .env.local
   ```
   Fill `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Settings → API).
   The service-role key is **server-only** — it is never sent to the browser and
   `.env.local` is gitignored.
4. **Run**
   ```bash
   npm run dev        # http://localhost:3000
   npm run typecheck  # verify types compile
   ```

## Security model (Phase 1)

- `leads` has **RLS enabled with no policies** → only the service-role key (used
  server-side via `src/lib/db.ts`) can read/write. Anon/public keys get nothing.
- All inbound data passes through `normalizeFormLead()` (zod + control-char
  stripping + length caps) before insert.
- All secrets live in `.env.local` (gitignored). Nothing is hardcoded.

## Phase 2 — Form lead intake ✅

`POST /api/leads/form` — validates + stores a website contact-form submission as a
lead (`source='form'`, `status='new'`). No AI call yet (Phase 4).

**Auth:** send header `x-api-key: <FORM_INTAKE_SECRET>`. Missing/wrong → `401`.
Set `FORM_INTAKE_SECRET` in `.env.local` (generate with `openssl rand -hex 32`).

> ⚠️ The secret must stay **server-side**. Integrate **server-to-server** (your site's
> PHP forwards to this endpoint). Do **not** call this route from browser JavaScript —
> that would expose the key. Server-to-server also means no CORS to configure.

**Request**
```
POST https://YOUR-CRM.vercel.app/api/leads/form
Content-Type: application/json
x-api-key: <FORM_INTAKE_SECRET>

{
  "form_type": "Quote Request",
  "name": "Sam Buyer",
  "email": "sam@brand.com",
  "company": "Brand Co",
  "product_type": "Hoodies",
  "quantity": "150",
  "message": "Need heavyweight hoodies with embroidery.",
  "source": "website",
  "date": "2026-06-30"
}
```
Field keys are matched case/space-insensitively (`Product Type`, `product_type`,
`productType` all work). The entire payload is stored in `raw_content`.

**Responses**
- `201 { "ok": true, "id": "<uuid>" }`
- `400 { "ok": false, "error": "<validation message>" }` — bad JSON / missing email+message
- `401 { "ok": false, "error": "Unauthorized" }` — missing/wrong `x-api-key`
- `500 { "ok": false, "error": "Internal error" }` — internals are logged, never returned

**Wire the website (server-to-server)** — add to `api/send-email.php` after `$data` is parsed:
```php
$CRM_URL = 'https://YOUR-CRM.vercel.app/api/leads/form';
$CRM_KEY = getenv('FORM_INTAKE_SECRET');   // set this in cPanel env, not in code
try {
    $ch = curl_init($CRM_URL);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json', 'x-api-key: ' . $CRM_KEY]);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 5);
    curl_exec($ch);
    curl_close($ch);
} catch (\Throwable $e) { /* never block the user's submission */ }
```

**Quick test**
```bash
curl -i -X POST http://localhost:3000/api/leads/form \
  -H "Content-Type: application/json" \
  -H "x-api-key: $FORM_INTAKE_SECRET" \
  -d '{"name":"Sam","email":"sam@brand.com","product_type":"Hoodies","quantity":"150","message":"Need a quote."}'
```

## Phase 3 — Email lead intake (IMAP worker) ✅

A standalone background worker polls the `info@fabrioza.com` mailbox over IMAP,
imports clothing/manufacturing enquiries as leads (`source='email'`, `status='new'`),
and **never** touches IMAP flags, deletes/moves mail, calls the AI, or replies.

| Piece | File |
|---|---|
| Worker loop (`npm run worker:email`) | `src/worker/email-intake.ts` |
| IMAP client from env | `src/lib/email/client.ts` |
| Clothing-enquiry filter (tunable) | `src/lib/email/filter.ts` |
| UID-watermark state | `src/lib/email/state.ts` |
| Poll cycle | `src/lib/email/intake.ts` |
| Manual trigger `POST /api/email/poll` | `src/app/api/email/poll/route.ts` |
| DB migration (dedupe + worker_state) | `db/phase3_email_dedupe.sql` |

### How it works
- Polls every `EMAIL_POLL_SECONDS` (default 180). Opens a connection, does one cycle,
  closes — gentle on cPanel limits. Exponential backoff (30s→15min) on errors; the
  loop never crashes. Graceful shutdown on SIGINT/SIGTERM.
- Tracks a **UID watermark** in `worker_state` and only fetches messages newer than
  the last one processed. **Your inbox read/unread state is never modified.**
- **First run watermarks to "now" and imports nothing** (no backfill of old mail —
  that's the separate Phase 6 migration).
- De-dupes by `Message-ID` (fallback `sha256(from|subject|date)`) so the same email
  can't create two leads.
- Filter logic lives at the top of `src/lib/email/filter.ts` — edit the keyword lists
  to tune what counts as a lead.

### cPanel → fill the IMAP env vars
In cPanel: **Email Accounts → (info@fabrioza.com) → Connect Devices →
“Secure SSL/TLS Settings”**, then put these in `.env.local`:

| cPanel field | `.env.local` |
|---|---|
| Incoming Server `mail.fabrioza.com` | `IMAP_HOST=mail.fabrioza.com` |
| IMAP Port `993` | `IMAP_PORT=993` |
| Username `info@fabrioza.com` | `IMAP_USER=info@fabrioza.com` |
| Password (the email account password) | `IMAP_PASSWORD=********` |
| SSL/TLS | `IMAP_TLS=true` |
| (poll interval) | `EMAIL_POLL_SECONDS=180` |

Also run the migration: Supabase → SQL Editor → paste `db/phase3_email_dedupe.sql` → Run.

### Run it
```bash
npm run worker:email           # starts the polling loop
```
Logs each cycle: `scanned=N imported=M skipped=K errors=E`.

### Manual one-shot test (no waiting for the loop)
```bash
curl -i -X POST http://localhost:3000/api/email/poll \
  -H "x-api-key: $FORM_INTAKE_SECRET"
# → { "ok": true, "scanned": .., "imported": .., "skipped": .., "errors": .., "firstRun": .. }
```

## Phase 4 — OpenAI lead agent ✅

One agent (OpenAI Agents SDK) reads each new lead and returns structured analysis,
which is written onto the lead and moves `status` → `drafted`.

| Piece | File |
|---|---|
| Agent + zod schema + `analyzeLead()` (retry-once) | `src/agent/leadAgent.ts` |
| Enrichment orchestrator (`enrichLead`, never throws) | `src/agent/enrich.ts` |
| Manual test CLI | `src/agent/test-agent.ts` |
| Fallback writer (keeps status `new`) | `src/lib/leads.ts → storeAiFallback()` |

**Output (validated with zod):**
`{ summary, intent: hot|warm|cold|spam, product_type, missing_info[], suggested_reply }`
→ saved as `ai_summary`, `ai_intent`, `ai_suggested_reply`.

**Reply rules:** warm "development partner" voice; thanks + restates the enquiry;
asks for the missing quote essentials (design/artwork, garment style+colour/fabric,
embroidery/print placement+size, sizes, quantity); **never invents a price**; `spam`
gets an empty placeholder reply.

**Safety:** strict zod validation → **retry once** → on repeated bad output, store a
safe fallback reply and **leave `status='new'`** (nothing lost). Enrichment is wired
into the form route and the email worker, wrapped so a model/network failure can never
break intake (the lead is stored first).

**Config (env only):** `OPENAI_API_KEY`, `OPENAI_MODEL` (default `gpt-4o-mini`),
`OPENAI_TEMPERATURE` (default `0.4`).

**Test it (needs only `OPENAI_API_KEY` in `.env.local`):**
```bash
npm run agent:test -- "Need 200 custom hoodies, black, embroidered logo, sizes S-XL. Price?"
npm run agent:test -- "Increase your Instagram followers fast, DM us!"   # should classify spam
```

## Phase 5 — Review dashboard + Gmail draft ✅

A password-protected internal dashboard to review AI-drafted replies and create
**Gmail drafts** (human-in-the-loop, **draft-only — never auto-sends**).

| Piece | File |
|---|---|
| Session auth (Web Crypto HMAC) | `src/lib/auth.ts` |
| Route gate | `middleware.ts` |
| Login page / API | `src/app/login/page.tsx`, `src/app/api/auth/login` & `…/logout` |
| Dashboard UI | `src/app/dashboard/page.tsx` |
| Leads list / detail / update | `src/app/api/admin/leads/route.ts`, `…/[id]/route.ts` |
| Gmail draft | `src/app/api/admin/leads/[id]/draft/route.ts`, `src/lib/gmail.ts` |

### Set these in `.env.local`
```
DASHBOARD_PASSWORD=choose-a-strong-password
AUTH_SESSION_SECRET=<openssl rand -hex 32>
GMAIL_CLIENT_ID=...        # Desktop OAuth client
GMAIL_CLIENT_SECRET=...
GMAIL_REFRESH_TOKEN=...    # from: npm run gmail:token
```

### How to log in
1. `npm run dev` → open **http://localhost:3000/dashboard**.
2. You'll be redirected to `/login`. Enter `DASHBOARD_PASSWORD`.
3. A signed, HttpOnly session cookie (12 h) is set; you're sent to the dashboard.
   “Log out” clears it. All `/dashboard` + `/api/admin/*` routes require it.

### The draft flow (draft-only)
1. Pick a lead → review the original message, AI summary, intent.
2. Edit the **subject** and the **reply** (pre-filled with the AI draft).
3. Click **Create Gmail draft** → a DRAFT is created in `fabriozadotcom@gmail.com`,
   addressed to the lead's email, and the lead is set to `status='drafted'`.
4. **Open Gmail, review, and hit send yourself.** The app never sends.
5. **Mark sent / won / lost** update the lead's status manually.

If the `GMAIL_*` vars aren't set, the draft button fails gracefully with a clear
“Gmail not configured” message — nothing crashes.

> Phase 6 (historical email import) is a later, separate task.
