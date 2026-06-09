# Friend Group Auth — integration reference

Base URL (this instance): `http://localhost:3000`
Discovery (RFC 8414): `http://localhost:3000/.well-known/oauth-authorization-server` — lists every endpoint below, including
the non-standard `payment_*` and `device_*` extensions. Point an OAuth client at
it to auto-configure.

## Endpoints
| Purpose            | Method & path                          |
| ------------------ | -------------------------------------- |
| Authorize          | `GET  http://localhost:3000/oauth/authorize`        |
| Token              | `POST http://localhost:3000/api/oauth/token`        |
| Userinfo           | `GET  http://localhost:3000/api/oauth/userinfo`     |
| Revoke             | `POST http://localhost:3000/api/oauth/revoke`       |
| Create pay intent  | `POST http://localhost:3000/api/pay/intent`         |
| User confirms pay  | `GET  http://localhost:3000/pay?intent=…`           |
| Verify pay         | `POST http://localhost:3000/api/pay/verify`         |

## Hard rules
- PKCE (S256) is **required** on the authorization request.
- `client_secret` is server-side only — never send it to the browser.
- All token/pay POSTs are `application/x-www-form-urlencoded`.
- Client auth: `client_secret` in the body (`client_secret_post`) **or** HTTP Basic
  (`client_secret_basic`) — either is accepted.
- `redirect_uri` must **exactly** match a registered URI.
- Gate access on `allowed === true` from userinfo; deny otherwise.
- Store the user keyed on `sub` (stable; `id` is the same value). Verify `state` on
  the callback and re-verify payments server-side.

## Scopes (request only what you need, space-separated)
- `identify` : `username`, `global_name`, `avatar`, `discord_id`
- `roles`    : `roles[]`, `allowed`, `in_guild`
- `credits`  : `credits` (integer balance)

Requesting a scope the app isn't allowed is rejected with `invalid_scope` (no
silent down-scoping). The granted `scope` is echoed in the token response.

## Login — Authorization Code + PKCE
1. **Begin (server-side):**
   - `code_verifier = base64url(32 random bytes)`
   - `code_challenge = base64url(sha256(code_verifier))`
   - `state = base64url(16 random bytes)`; persist `{code_verifier, state}` in session.
   - Redirect to:
     ```
     GET http://localhost:3000/oauth/authorize?response_type=code
       &client_id={CLIENT_ID}
       &redirect_uri={REDIRECT_URI}
       &scope=identify%20roles
       &state={state}
       &code_challenge={code_challenge}
       &code_challenge_method=S256
     ```
2. **Callback** at `{REDIRECT_URI}`: receives `?code=…&state=…` (or `?error=…&error_description=…&state=…`). Verify `state`.
3. **Exchange code (server-side, form-encoded):**
   ```
   POST http://localhost:3000/api/oauth/token
   grant_type=authorization_code&code={code}&redirect_uri={REDIRECT_URI}
   &code_verifier={code_verifier}&client_id={CLIENT_ID}&client_secret={CLIENT_SECRET}
   ```
   → `{ access_token, token_type:"Bearer", expires_in:3600, refresh_token, scope }`
4. **Userinfo:**
   ```
   GET http://localhost:3000/api/oauth/userinfo
   Authorization: Bearer {access_token}
   ```
   → `{ sub, id, username, global_name, avatar, discord_id, roles, allowed, in_guild, credits }`
   Require `allowed === true`.

### Tokens & refresh
Access tokens last 1h, refresh tokens 30d. Refreshing **rotates** the refresh
token (old one invalidated) — always use the newest. Presenting an already-rotated
refresh token triggers reuse detection and revokes the whole token family;
re-authorize if that happens.
```
POST http://localhost:3000/api/oauth/token
grant_type=refresh_token&refresh_token={rt}&client_id={CLIENT_ID}&client_secret={CLIENT_SECRET}
```
Revoke: `POST http://localhost:3000/api/oauth/revoke` with `token={t}` + client auth.

## Pay — charge a user credits (only if the app needs it)
1. **Create an intent (server-side):**
   ```
   POST http://localhost:3000/api/pay/intent
   client_id=…&client_secret=…&amount={positive int}&ref={your idempotency key}
   &redirect_uri={a registered return URL}&description={optional}&state={optional}
   ```
   → `{ intent_id, url, amount, status:"pending", expires_at }`
   Idempotent on (client, ref): same ref + same amount returns the same intent;
   same ref + a different amount/description is rejected `409` — use a fresh ref.
2. **Redirect the user to `url`.** They return with
   `?intent_id=…&ref=…&status=…&state=…`, where `status` ∈
   `{ completed, cancelled, insufficient_funds, access_denied }`.
3. **Verify server-side before granting value:**
   ```
   POST http://localhost:3000/api/pay/verify
   client_id=…&client_secret=…&intent_id={intent_id}
   ```
   → `{ intent_id, status, amount, ref, description, user_id, paid }`. Grant only when `paid === true`.

### Webhooks (optional, recommended)
Configure a webhook URL on the app in the dashboard (**Manage → Webhook**); saving
reveals a signing secret once. On settle we POST JSON with headers
`X-Webhook-Id` (idempotency key) and
`X-Webhook-Signature: t=<unix>,v1=<base64url HMAC-SHA256 of \`<t>.<rawBody>\`>`.
Verify the signature, de-dupe on the id, and still treat verify as authoritative.
Delivery is best-effort.

## Gotchas
- `redirect_uri` mismatch (scheme/host/path) is the most common failure.
- A user can be `allowed: false` even while logged in (left the server / lost the
  role) — re-check on each login.
- Credits are whole numbers; there's no currency conversion.

