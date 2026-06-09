---
name: friend-group-auth
description: >-
  Integrate this app with Friend Group Auth (http://localhost:3000) — a Discord-gated OAuth 2.0
  + PKCE provider with a shared credit/payment system. Use when the user wants to
  add "login with our group", gate access on Discord membership/role, or charge
  credits. Registers the OAuth app automatically via a browser-approved device
  flow (no manual dashboard setup, no copied secrets) and writes the login,
  callback, and (optional) payment code.
---

# Friend Group Auth integration

This skill connects the current project to **Friend Group Auth** at `http://localhost:3000`.
You will register the OAuth app *for* the user via a browser-approval flow, then
implement the integration. The user's only manual step is clicking **Approve** in
a browser tab.

Read `reference.md` (next to this file) for the exact endpoint contracts. Do not
invent endpoints or parameters beyond what it documents.

## Step 1 — Understand the project
- Detect the web framework, language, and existing session/auth conventions. Match them.
- Determine the **local dev URL** (e.g. `http://localhost:3000`). Check the dev
  script / config for the port; ask the user if ambiguous.
- Choose a callback path that fits the framework (e.g. `/api/auth/callback`,
  `/auth/callback`). The dev redirect URI is `<dev-url><callback-path>`.

## Step 2 — Collect the redirect URIs
- Always include the **dev** redirect URI.
- Ask the user once for their **production base URL** (e.g.
  `https://myapp.example.com`). If they give one, add `<prod-url><callback-path>`.
  If they skip it, proceed with dev only and tell them they can re-run this skill
  later to add prod.
- If the app charges credits, also register a **payment return** URI for each base
  (e.g. `<base>/pay/return`).

## Step 3 — Start the device authorization
POST JSON to the start endpoint. `redirect_uris` is the full list from Step 2;
`scopes` is what the app needs (`identify`, optionally `roles`, `credits`).

```bash
curl -sS -X POST http://localhost:3000/api/manage/device/start \
  -H 'content-type: application/json' \
  -d '{
    "name": "<app name the user will recognise>",
    "redirect_uris": ["http://localhost:3000/api/auth/callback"],
    "scopes": ["identify", "roles"]
  }'
```

Response: `{ device_code, user_code, verification_uri, verification_uri_complete, expires_in, interval }`.

## Step 4 — Send the user to approve
Show the user this prominently and wait:

> **Approve the app registration:** open `<verification_uri_complete>`
> (code: `<user_code>`) and click **Approve**.

The approval screen is at `http://localhost:3000/device`. The user must be signed in with a
Discord account that has access to the group.

## Step 5 — Poll for the credentials
Poll the poll endpoint every `interval` seconds with the `device_code`:

```bash
curl -sS -X POST http://localhost:3000/api/manage/device/poll \
  -H 'content-type: application/json' \
  -d '{ "device_code": "<device_code>" }'
```

- `{"error":"authorization_pending"}` → keep waiting.
- `{"error":"slow_down"}` → wait longer, then retry.
- `{"error":"access_denied"}` → the user denied; stop and tell them.
- `{"error":"expired_token"}` → the request expired; restart from Step 3.
- Success → `{ client_id, client_secret, redirect_uris, scopes, app_url, discovery_url }`.
  These are returned **once** — capture them immediately.

## Step 6 — Store the credentials (server-side only)
Write to the project's server-side env (e.g. `.env` / `.env.local`), and ensure
it's git-ignored. **Never** expose `client_secret` to the browser/client bundle.

```
AUTH_BASE_URL=http://localhost:3000
AUTH_CLIENT_ID=<client_id>
AUTH_CLIENT_SECRET=<client_secret>
AUTH_REDIRECT_URI=<the dev redirect URI you registered>
```

## Step 7 — Implement the integration
Follow `reference.md` exactly:
- A login route that redirects to `/oauth/authorize` with a fresh PKCE pair + state.
- A callback route that verifies `state`, exchanges the code at the token endpoint,
  calls userinfo, and **requires `allowed === true`** before creating a local session.
- Key the local user on `sub` (stable). Store tokens server-side; refresh rotates.
- If charging: a route that creates a payment intent and redirects to its `url`, and
  a return route that calls the verify endpoint and grants value only when `paid === true`.

## Step 8 — Report back
Tell the user which routes/files you created, that the app is registered (it shows
under **Provider apps** in their dashboard at `http://localhost:3000/dashboard`), and how to set
the env vars in production. Remind them to add the prod redirect URI if they
skipped it (re-run this skill or edit the app in the dashboard).

