# Friend Group Auth — example app

A minimal Next.js (App Router) app that logs in against the **Friend Group
Auth** server (OAuth 2.0 + PKCE) and shows whether authentication succeeded. It
also includes the optional credits **pay** flow.

The app runs on **http://localhost:3330** (set in `package.json`) so the
redirect URIs match the registered ones exactly.

## Setup

1. Install deps and copy the env template:

   ```bash
   npm install
   cp .env.example .env.local
   ```

2. Edit `.env.local`:

   | Variable               | Notes                                                                 |
   | ---------------------- | --------------------------------------------------------------------- |
   | `AUTH_BASE_URL`        | The auth server. Default `http://localhost:3000`.                     |
   | `FGC_CLIENT_ID`        | Your OAuth client id.                                                  |
   | `FGC_CLIENT_SECRET`    | **Server-only.** The secret shown when you registered the app.        |
   | `FGC_REDIRECT_URI`     | Must match a registered redirect URI exactly (`.../callback`).        |
   | `FGC_PAY_REDIRECT_URI` | Pay return URL — must also be registered (`.../pay/callback`).         |
   | `SESSION_SECRET`       | **Server-only.** Random string used to HMAC-sign session cookies.     |

   Generate a session secret:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```

   `FGC_CLIENT_SECRET` and `SESSION_SECRET` have no `NEXT_PUBLIC_` prefix, so
   Next.js never bundles them for the browser. They are read only inside Route
   Handlers / Server Components.

3. Run it:

   ```bash
   npm run dev      # http://localhost:3330
   ```

   Open the page and click **Login with Friend Group Auth**.

## Routes

| Route               | Method | What it does                                                                                                   |
| ------------------- | ------ | -------------------------------------------------------------------------------------------------------------- |
| `/`                 | GET    | Home page. Shows authenticated/not, the user (name, id, roles, credits), and Login / Logout / Buy buttons.     |
| `/login`            | GET    | Generates a fresh PKCE pair + state, stores them in an httpOnly cookie, redirects to `/oauth/authorize`.        |
| `/callback`         | GET    | `REDIRECT_URI`. Verifies `state`, exchanges the code (server-side), calls userinfo, enforces `allowed===true`, creates the session. |
| `/api/refresh`      | POST   | Refreshes tokens (rotates the refresh token) and re-reads userinfo. Returns JSON.                              |
| `/logout`           | POST   | Revokes both tokens server-side, then clears the local session.                                                |
| `/buy`              | GET    | Creates a payment intent server-side (fixed amount) and redirects to its pay URL.                              |
| `/pay/callback`     | GET    | Pay return URL. **Always** re-verifies with `/api/pay/verify` and grants value only when `paid===true`.        |

## How it maps to the spec

- **PKCE (S256)** — `app/lib/pkce.ts`. `code_verifier = base64url(32 bytes)`,
  `code_challenge = base64url(sha256(verifier))`, `state = base64url(16 bytes)`.
- **`code_verifier` / `state` persistence** — stored in the short-lived,
  httpOnly, signed `fgc_tx` cookie between `/login` and `/callback`.
- **State verification** — `/callback` compares the returned `state` to the
  stored one before doing anything else.
- **Server-to-server only** — token exchange, refresh, revoke, userinfo, pay
  intent and pay verify all live in `app/lib/oauth.ts` and run server-side. All
  token/pay POSTs are `application/x-www-form-urlencoded`.
- **Gate on `allowed`** — `/callback` (and `/api/refresh`) deny access unless
  `allowed === true`.
- **Re-verify payments server-side** — `/pay/callback` ignores the redirect's
  `status` and calls `/api/pay/verify`, granting value only on `paid === true`.
- **Tokens** — kept in the httpOnly `fgc_session` cookie; never readable by
  browser JavaScript.

## File layout

```
app/
  lib/
    config.ts     env + endpoints (server-only secrets)
    pkce.ts       PKCE + state generation
    session.ts    HMAC-signed httpOnly cookie session
    oauth.ts      server-to-server calls + authorize URL
  components/
    RefreshButton.tsx
  login/route.ts
  callback/route.ts
  api/refresh/route.ts
  logout/route.ts
  buy/route.ts
  pay/callback/route.ts
  page.tsx        the status UI
```

> Note: this example stores the session in a signed (not encrypted) cookie for
> simplicity. For production, encrypt the payload or keep tokens in a
> server-side store keyed by an opaque session id.
