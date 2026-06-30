// One-time helper: get a Gmail API refresh token via the installed-app
// loopback flow. Run with:  npm run gmail:token
//
// Reads GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET from .env.local, opens a temporary
// loopback server, prints an auth URL, and after you authorize fabriozadotcom@gmail.com
// it prints GMAIL_REFRESH_TOKEN. Your client secret is never printed.
// Zero extra dependencies (uses built-in http/crypto + global fetch).

import { config } from "dotenv";
config({ path: ".env.local" });
config();

import http from "node:http";
import crypto from "node:crypto";

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const SCOPE = "https://www.googleapis.com/auth/gmail.compose";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Missing GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET in .env.local");
  process.exit(1);
}

const state = crypto.randomBytes(16).toString("hex");
let redirectUri = "";

function fail(msg: string): never {
  console.error("\n✖ " + msg);
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");

  // Ignore noise like /favicon.ico — only act on the OAuth callback.
  if (!url.searchParams.has("code") && !url.searchParams.has("error")) {
    res.writeHead(204);
    res.end();
    return;
  }

  const respond = (html: string) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:40px">${html}</body>`);
  };

  const error = url.searchParams.get("error");
  if (error) {
    respond("<h2>Authorization cancelled.</h2><p>You can close this tab.</p>");
    server.close();
    fail("Authorization was denied: " + error);
  }

  if (url.searchParams.get("state") !== state) {
    respond("<h2>State mismatch.</h2>");
    server.close();
    fail("State mismatch — aborting for safety. Re-run the script.");
  }

  const code = url.searchParams.get("code") as string;

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });

    // Response.json() is typed as any; refresh_token is what we need.
    const json: { refresh_token?: string; error?: string; error_description?: string } =
      await tokenRes.json();

    if (!tokenRes.ok || !json.refresh_token) {
      respond("<h2>Token exchange problem.</h2><p>Check the terminal.</p>");
      server.close();
      if (tokenRes.ok && !json.refresh_token) {
        fail(
          "No refresh_token returned. Google only returns one on first consent. " +
            "Revoke prior access at https://myaccount.google.com/permissions for this app, then re-run."
        );
      }
      fail(`Token exchange failed: ${json.error ?? tokenRes.status} ${json.error_description ?? ""}`);
    }

    respond("<h2>Done ✓</h2><p>You can close this tab and return to the terminal.</p>");
    console.log("\n===============================================================");
    console.log("GMAIL_REFRESH_TOKEN=" + json.refresh_token);
    console.log("===============================================================");
    console.log("\nPaste the line above into .env.local (replace the empty GMAIL_REFRESH_TOKEN=).\n");
    server.close();
    process.exit(0);
  } catch (e) {
    respond("<h2>Unexpected error.</h2>");
    server.close();
    fail("Error exchanging code: " + (e as Error).message);
  }
});

server.listen(0, "127.0.0.1", () => {
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  redirectUri = `http://localhost:${port}`;

  const authUrl =
    "https://accounts.google.com/o/oauth2/v2/auth?" +
    new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPE,
      access_type: "offline",
      prompt: "consent",
      state,
    }).toString();

  console.log("\n1) Open this URL in your browser and sign in as fabriozadotcom@gmail.com:\n");
  console.log(authUrl + "\n");
  console.log(`2) Approve the "Compose Gmail" permission. Waiting for the redirect on ${redirectUri} …\n`);
});
