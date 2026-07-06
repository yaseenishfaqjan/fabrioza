# FABRIOZA — Deployment & Operations Runbook

Hand this to any new Claude Code / developer. It describes the whole system, how it's
deployed, and every routine task. **Status: LIVE and working.**

---

## 1. What this project is

Two things in ONE GitHub repo, deployed together with Docker on ONE VPS:

1. **Marketing site** — `https://fabrioza.com` — plain, **editable** static HTML/CSS/JS
   (NOT a framework build). Homepage = `index.html` + `assets/home.css` + `assets/home.js`.
   Plus static service pages, blog, `/what-we-make/`, images, videos. The contact form
   posts to `api/send-email.php`, which forwards each lead to the CRM.
2. **CRM** — `https://api.fabrioza.com` — a **Next.js 14** app in `fabrioza-crm/` with a
   password-protected dashboard + APIs, backed by **Supabase (Postgres)**. A background
   **email worker** polls the `info@fabrioza.com` IMAP inbox, turns clothing enquiries
   into leads, and an **OpenAI agent** drafts a reply for each lead. Replies are
   **draft-only** (creates a Gmail draft; a human sends).

Lead flow: `website form OR email → stored in Supabase → AI drafts reply → review at
api.fabrioza.com/dashboard → "Create Gmail draft" → you send from Gmail`.

---

## 2. Infrastructure

| Thing | Value |
|---|---|
| GitHub repo | `https://github.com/yaseenishfaqjan/fabrioza` (branch `main`) |
| VPS (Contabo) | **`209.145.55.76`** — hosts the website + CRM + worker |
| Old cPanel host | **`95.216.22.216`** — now **EMAIL ONLY** (IMAP/SMTP for info@fabrioza.com) |
| Repo path on VPS | `/opt/fabrioza` |
| Shared reverse proxy | Docker container **`scalaro-nginx-1`** owns ports 80/443; its config file is **`/opt/scalaro/nginx.conf`** |
| Supabase project | "Fabrioza leads" — Postgres; tables `leads`, `worker_state` |

The FABRIOZA stack is a separate Docker Compose project; it shares only the nginx proxy
with the unrelated "Scalaro" sites. Never tangle their configs.

---

## 3. Containers (docker-compose.yml at repo root)

| Service | Image | Host port | Role |
|---|---|---|---|
| `web` | `fabrioza-web` (from `Dockerfile.web`, php:8.2-apache) | `0.0.0.0:8095 → 80` | serves the static site + `send-email.php` |
| `crm` | `fabrioza-crm` (from `fabrioza-crm/Dockerfile`, node:22 + `next build`) | `0.0.0.0:8001 → 3000` | dashboard + APIs |
| `worker` | same `fabrioza-crm` image | none | `npm run worker:email` (IMAP poller), `restart: unless-stopped` |

Network: `fabrioza-net`. The web→CRM form forward is internal: `http://crm:3000`.
`scalaro-nginx-1` is attached to `fabrioza-net` (run once):
`docker network connect fabrioza-net scalaro-nginx-1`.

---

## 4. nginx (in `/opt/scalaro/nginx.conf`)

- **`fabrioza.com` / `www`** → `proxy_pass http://172.19.0.1:8095;` (the web container)
- **`api.fabrioza.com`** → `proxy_pass http://172.19.0.1:8001;` (the CRM)
- Both have an HTTP→HTTPS 301 redirect + Let's Encrypt certs.
- Reload after any change: `docker exec scalaro-nginx-1 nginx -t && docker exec scalaro-nginx-1 nginx -s reload`
- Certs (DNS challenge, interactive): `certbot certonly --manual --preferred-challenges dns -d fabrioza.com -d www.fabrioza.com` (renew before expiry; these are `--manual` so NOT auto-renewed).

---

## 5. DNS (cPanel Zone Editor — CURRENT, CORRECT state)

| Name | Type | Value | Purpose |
|---|---|---|---|
| `fabrioza.com` | A | `209.145.55.76` | website → VPS |
| `www.fabrioza.com` | A | `209.145.55.76` | website → VPS |
| `api.fabrioza.com` | A | `209.145.55.76` | CRM → VPS |
| `fabrioza.com` | MX | `mail.fabrioza.com` (pri 0) | email → cPanel |
| `mail.fabrioza.com` | A | `95.216.22.216` | mail server (cPanel) |
| `cpanel/webmail/whm/...` | A | `95.216.22.216` | cPanel admin |
| SPF / DKIM / DMARC / `_acme-challenge` | TXT | (as-is) | mail auth + cert validation |

⚠️ **Do not point the apex `fabrioza.com` MX or `mail.` at the VPS** — the VPS has no mail
server; that breaks email. Website = VPS, email = cPanel.

---

## 6. Secrets / environment (NEVER committed — gitignored)

Two env files, created on the VPS by hand (values live only in the user's local
`fabrioza-crm/.env.local` and on the VPS):

**`fabrioza-crm/.env.production`** (CRM + worker) — variable NAMES:
```
SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY        # server-only DB access
FORM_INTAKE_SECRET                             # shared secret for /api/leads/form
OPENAI_API_KEY, OPENAI_MODEL, OPENAI_TEMPERATURE
DASHBOARD_PASSWORD, AUTH_SESSION_SECRET        # dashboard login + cookie signing
IMAP_HOST=mail.fabrioza.com, IMAP_PORT=993, IMAP_USER=info@fabrioza.com,
IMAP_PASSWORD, IMAP_TLS=true, EMAIL_POLL_SECONDS=180
GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN   # Gmail draft (scope gmail.compose)
```
**Root `.env`** (for the web→CRM forward): `FORM_INTAKE_SECRET=<same value as above>`.

Templates: `fabrioza-crm/.env.example`. To refresh a Gmail token:
`cd fabrioza-crm && npm run gmail:token` (loopback OAuth; paste result into `.env.production`).

---

## 7. Deploy workflows

### 7a. Website change (homepage, images, CSS, PHP) — FAST, do this most often
```bash
cd /opt/fabrioza && git pull
docker compose build web
docker compose up -d --no-deps web
docker compose ps
```
Then hard-refresh the browser (Ctrl+Shift+R). **Only rebuild `web`** — never the CRM for a
site-only change.

### 7b. CRM or worker change (code in `fabrioza-crm/`) — HEAVY (~3 min build)
```bash
cd /opt/fabrioza && git pull
docker compose build crm
docker compose up -d --no-deps crm worker
docker compose logs --tail=20 worker
```
(`crm` and `worker` share the same image; building `crm` covers both.)

### 7c. First-time / full bring-up
```bash
cd /opt && git clone https://github.com/yaseenishfaqjan/fabrioza.git && cd fabrioza
cp fabrioza-crm/.env.example fabrioza-crm/.env.production   # then fill it in
grep '^FORM_INTAKE_SECRET=' fabrioza-crm/.env.production > .env
docker compose up -d --build
docker network connect fabrioza-net scalaro-nginx-1
docker compose ps
```
Then add the nginx server block + cert (section 4) and flip DNS (section 5).

### 7d. Disk maintenance (a 97 GB disk fills fast with rebuilds — run periodically!)
```bash
docker image prune -af && docker builder prune -af
df -h /
```

---

## 8. Verify / smoke tests
```bash
curl -sI https://fabrioza.com | head -3                 # HTTP/2 200
curl -s  https://fabrioza.com | grep -o "From Our Factory Floor"   # new homepage present
curl -sI https://api.fabrioza.com/login | head -3       # CRM up (200)
docker compose logs --tail=20 worker                    # "started. polling every 180s"
# test a lead end-to-end (secret from .env):
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:8001/api/leads/form \
  -H "Content-Type: application/json" -H "x-api-key: <FORM_INTAKE_SECRET>" \
  -d '{"name":"Test","email":"t@example.com","product_type":"hoodies","quantity":"150","message":"quote please"}'
# → 201; lead appears at api.fabrioza.com/dashboard with an AI draft
```

---

## 9. Troubleshooting

| Symptom | Cause / Fix |
|---|---|
| `no space left on device` during build | Disk full. `docker image prune -af && docker builder prune -af`, then rebuild. Check `docker system df`. |
| Homepage shows OLD site / "Not secure" | DNS still on old host, OR browser cache. Confirm `dig +short fabrioza.com` = `209.145.55.76`; hard-refresh. |
| Contact form "Unable to send email" | Expected only if the CRM forward fails. Web container must have `CRM_FORM_URL` + `FORM_INTAKE_SECRET` env and reach `crm`. The form succeeds when the lead saves to the CRM (local `mail()` is best-effort). |
| Dashboard list empty but leads exist | Supabase reads were being cached by Next's patched `fetch`. Already fixed in `src/lib/db.ts` with `cache:"no-store"`. |
| `pull access denied for fabrioza-crm` | Worker had no build context. Already fixed (worker has `build:` + `pull_policy: never`). |
| Email not arriving / worker can't IMAP | `mail.fabrioza.com` must be an **A record → 95.216.22.216** and MX → `mail.fabrioza.com`. |
| Middleware not gating dashboard | Middleware must be `fabrioza-crm/src/middleware.ts` (inside `src/`), not repo root. |
| `git pull` triggers full CRM rebuild unexpectedly | Use `--no-deps web` to rebuild only web (section 7a). |

---

## 10. Editing the site (it's all plain, editable code)

- **Homepage:** `index.html` — sections in order: nav, hero, trust strip, **videos**
  (`/videos/*.mp4`), products (filterable gallery, edit the `<article class="product">`
  cards), "What We Make" (8 `/images/products-premium/*.webp`), process, factory/why-us,
  **"From Our Factory Floor"** gallery, stats, pricing, FAQ, contact form, footer.
- **Styles:** `assets/home.css`. **Behavior:** `assets/home.js` (gallery filter, mobile
  menu, live order ticker, form submit).
- **Images:** `/images/` (products `prod-*.jpg`, `img-*.jpg`, `content-*`, premium webp).
- **Videos:** `/videos/*.mp4` (production-floor autoplays/loops on the homepage).
- **Service pages / blog:** self-contained static HTML using `/assets/landing.css`.
- The head of `index.html` holds all SEO/schema/GA4 — preserve it when editing.

> The original site was a compiled React (Vite) bundle with no source available; the
> homepage was rebuilt as this editable static code. The old bundle (`assets/index-*.js`)
> is still used only by the 6 legacy React blog shells under `blog/<slug>/`.

---

## 11. CRM quick reference (fabrioza-crm/)
- Dashboard: `https://api.fabrioza.com/dashboard` (login = `DASHBOARD_PASSWORD`).
- Key files: `src/app/dashboard/page.tsx`, `src/app/api/leads/form/route.ts`,
  `src/lib/email/intake.ts` + `src/worker/email-intake.ts`, `src/agent/leadAgent.ts`,
  `src/lib/gmail.ts`, `src/middleware.ts`, `db/schema.sql`, `db/phase3_email_dedupe.sql`.
- DB migrations: run the `db/*.sql` files in the Supabase SQL editor.
- Local dev: `cd fabrioza-crm && npm install && npm run dev` (uses `.env.local`).
