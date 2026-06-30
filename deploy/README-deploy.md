# FABRIOZA — VPS deployment (Docker, single box)

Runs the whole stack behind your existing shared proxy `scalaro-nginx-1`:

| Service | Container | Internal | Public |
|---|---|---|---|
| Static site + `send-email.php` | `fabrioza-web` | `:80` | `fabrioza.com` |
| CRM (dashboard + APIs) | `fabrioza-crm` | `:3000` | `api.fabrioza.com` |
| Email worker | `fabrioza-worker` | — | none |

The website form posts to `/api/send-email.php`, which **forwards each lead to the CRM
internally** (`http://crm:3000/api/leads/form`) — the secret never reaches the browser.

---

## 1. DNS (at the fabrioza.com registrar)
Add A records, **leave MX/mail records untouched**:
```
@    A   209.145.55.76
www  A   209.145.55.76
```
`api.fabrioza.com` already resolves/exists in your nginx — no DNS change needed for it.

## 2. Get the code on the VPS
```bash
git clone <your-repo-url> fabrioza        # or: cd fabrioza && git pull
cd fabrioza
```

## 3. Secrets (never committed)
```bash
# CRM secrets
cp fabrioza-crm/.env.example fabrioza-crm/.env.production
nano fabrioza-crm/.env.production    # fill Supabase, OpenAI, IMAP, Gmail, DASHBOARD_PASSWORD,
                                     # AUTH_SESSION_SECRET, FORM_INTAKE_SECRET

# Root compose env (web → CRM forward): SAME FORM_INTAKE_SECRET value
cp .env.example .env
nano .env                            # FORM_INTAKE_SECRET=<same value as above>
```

## 4. Build + run
```bash
docker compose up -d --build
docker compose ps          # web, crm, worker all "Up"
docker compose logs -f worker   # watch the email poller (Ctrl-C to stop tailing)
```

## 5. Put the two sites on the proxy
Connect the shared proxy to this stack's network **once**:
```bash
docker network connect fabrioza-net scalaro-nginx-1
```
Now nginx can reach the containers by name: `http://fabrioza-web:80` and `http://fabrioza-crm:3000`.

### 5a. fabrioza.com — SSL (DNS challenge) + server block
```bash
certbot certonly --manual --preferred-challenges dns -d fabrioza.com -d www.fabrioza.com
# add the TXT record(s) it prints → wait 1-2 min → Enter
```
Append to the proxy's nginx config (`/opt/scalaro/nginx.conf`):
```nginx
# fabrioza.com
server {
    listen 80; listen [::]:80;
    server_name fabrioza.com www.fabrioza.com;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://fabrioza.com$request_uri; }
}
server {
    listen 443 ssl; http2 on; listen [::]:443 ssl;
    server_name fabrioza.com www.fabrioza.com;
    ssl_certificate     /etc/letsencrypt/live/fabrioza.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/fabrioza.com/privkey.pem;
    client_max_body_size 25m;
    location / {
        proxy_pass http://fabrioza-web:80;     # joined fabrioza-net (or http://172.19.0.1:8095)
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 300s;
    }
}
```

### 5b. api.fabrioza.com — already wired in your nginx
It currently points to `172.19.0.1:8001`, which is exactly where the CRM is published
(`127.0.0.1:8001:3000`). **No change needed.** (If you'd rather use the network name,
change its `proxy_pass` to `http://fabrioza-crm:3000`.)

> The CRM dashboard lives at **https://api.fabrioza.com/dashboard**. If you prefer a
> dedicated `crm.fabrioza.com`, add a server block just like 5a with
> `proxy_pass http://fabrioza-crm:3000;`.

## 6. Reload + verify
```bash
docker exec scalaro-nginx-1 nginx -t && docker exec scalaro-nginx-1 nginx -s reload
curl -sik https://fabrioza.com | head -5
curl -sik https://api.fabrioza.com/login | head -5
```

## 7. Point the website form at the CRM
Already handled: `send-email.php` reads `CRM_FORM_URL` + `FORM_INTAKE_SECRET` from the
container env (set in `docker-compose.yml` + `./.env`). Submit the live contact form →
the lead appears in the dashboard, AI-analyzed, with a draft reply ready.

---

## Updating later
```bash
git pull
docker compose up -d --build      # rebuilds only what changed
```

## Notes
- **Ports** `8095`/`8001` are bound to `127.0.0.1` only. Reaching them from the nginx
  container uses the `fabrioza-net` connection (step 5) via container names — nothing is
  exposed on the public VPS IP. (If your proxy must use `172.19.0.1:<port>` instead,
  change the compose port bindings to `8095:80` / `8001:3000` and firewall those ports.)
- **Email notifications from `send-email.php`** (PHP `mail()`) need an SMTP relay inside
  the web container; the CRM lead capture works regardless. Tell me if you want the
  Apple-Mail-style notifications wired via your `mail.fabrioza.com` SMTP.
- **`worker` first run** watermarks to "now" and imports nothing (no backfill) — that's
  the future Phase 6 historical import.
