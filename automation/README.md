# FABRIOZA — Form Email Automation (n8n, Approval Gate)

This folder is **NOT part of the website** — do not deploy it to the web server.
It contains an importable n8n workflow that reads contact-form submissions, has an
AI classify + draft a reply, and **asks you to approve before anything is sent**.

File: `fabrioza-email-automation.n8n.json`

## What it does (Option B — form-only, approval gate)

```
Form submitted  →  Webhook
      ↓
Build Prompt (injects FABRIOZA facts: MOQ 50, ISO 9001, 24h quote, OEM/ODM, shipping…)
      ↓
AI Classify & Draft (OpenAI GPT-4o, returns JSON)
      ↓
Route by Classification
   ├─ quote_request ─┐
   ├─ general_question ┘→ Send Draft for Approval (email to YOU: Approve / Disapprove)
   │                          ├─ Approved   → Send Reply to Customer → Log Lead (Sent)
   │                          └─ Disapproved → Log Lead (Disapproved)   (nothing sent)
   ├─ existing_client → Alert Human (no auto-reply — you handle it)
   └─ spam → Discard silently
```

Nothing reaches a customer until you click **Approve**. This is the safe "week 1–2"
configuration. To go full-auto later, see "Going full-auto" below.

## One-time setup (≈15 min)

### 1. Import
n8n → **Workflows → Import from File** → choose `fabrioza-email-automation.n8n.json`.

### 2. Create 3 credentials and attach them to the nodes that say `REPLACE_WITH_…`
- **OpenAI** → create an **HTTP Header Auth** credential:
  - Name: `Authorization`  Value: `Bearer sk-...your-openai-key...`
  - Attach to node **AI Classify & Draft (OpenAI)**.
- **Gmail OAuth2** (the `info@fabrioza.com` account) → attach to the 3 Gmail nodes
  (**Send Draft for Approval**, **Send Reply to Customer**, **Alert Human**).
  *(Prefer SMTP/Outlook? Swap the Gmail nodes for "Send Email" nodes — same fields.)*
- **Google Sheets OAuth2** → attach to **Log Lead (Sent)** and **Log Lead (Disapproved)**.

### 3. Fill the placeholders
- `REPLACE_WITH_YOUR_APPROVER_EMAIL` (2 nodes) → the inbox where YOU approve drafts.
- `REPLACE_WITH_GOOGLE_SHEET_ID` (2 nodes) → a Google Sheet with a tab named **Leads**
  and a header row: `received_at | classification | contact_name | contact_email |
  product_type | quantity | deadline | status | subject_sent`.

### 4. Activate & get the webhook URL
Toggle the workflow **Active**. Open **Form Submission (Webhook)** and copy the
**Production URL** (looks like `https://YOUR-n8n-host/webhook/fabrioza-contact`).

### 5. Point the website form at n8n
Your site posts the form to `/api/send-email.php`. The cleanest way to also feed n8n
**without touching the React app** is to forward a copy from PHP. Add this near the top
of `api/send-email.php`, right after `$data` is parsed:

```php
// --- Forward a copy to n8n automation (best-effort, non-blocking) ---
$N8N_WEBHOOK = 'https://YOUR-n8n-host/webhook/fabrioza-contact';
try {
    $ch = curl_init($N8N_WEBHOOK);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 4);
    curl_exec($ch);
    curl_close($ch);
} catch (\Throwable $e) { /* ignore — never block the user's submission */ }
// --- end forward ---
```

The form fields this expects (already sent by your form): `name`, `email`, `company`,
`product_type`, `quantity`, `form_type`, `message`. The webhook reads them from
`$json.body.*`.

### 6. Test
Submit your own contact form (or use n8n's **Listen for Test Event** + a curl POST).
You should receive an approval email with the draft and **Approve / Disapprove**
buttons. Approve → the reply lands in the test customer inbox and a row appears in
the Sheet.

```bash
curl -X POST https://YOUR-n8n-host/webhook/fabrioza-contact \
  -H "Content-Type: application/json" \
  -d '{"name":"Sam Test","email":"you@example.com","product_type":"hoodies","quantity":"150","message":"Need a quote for 150 custom heavyweight hoodies with embroidery."}'
```

## Going full-auto later
Once you've approved 20–30 correct drafts: keep the approval gate for `quote_request`
(highest stakes) but let `general_question` auto-send. Easiest change: connect the
**general_question** Switch output directly to **Send Reply to Customer** (skip the
approval node) and leave **quote_request** going through approval.

## Notes / honest caveats
- Built for **n8n 1.x**. If a node shows a version warning on import, open it and
  re-select the operation — the field values are all set correctly; only the node
  schema version may differ on your instance.
- The **"Send and Wait for Approval"** mechanism (node *Send Draft for Approval*) is
  n8n's native Human-in-the-Loop. It pauses the run and resumes when you click a button,
  so your n8n must be reachable at its public webhook URL.
- Approver email + customer reply both use the Gmail node; make sure the OAuth account
  is allowed to send as `info@fabrioza.com` (or change the from-address).
- The AI is constrained to FABRIOZA's real facts (same as `llms.txt`) and told never to
  invent prices/dates/order details — existing-client messages are always routed to a
  human, never auto-answered.
