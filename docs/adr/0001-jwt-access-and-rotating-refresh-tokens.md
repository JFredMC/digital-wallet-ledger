# ADR 0001 — JWT access tokens + rotating refresh tokens in an HttpOnly cookie

- **Status:** Accepted
- **Date:** 2026-10-01
- **Milestone:** Stage 1 / Auth

## Context

The SPA (Angular) and the API (NestJS) need a session mechanism that:

- keeps the user logged in across page reloads for days, without asking for the password again;
- limits the damage of a leaked credential (XSS, a copied token, a stolen laptop);
- works when the SPA and the API are served from the **same origin** (nginx locally,
  rewrites on Vercel/Netlify in production);
- is cheap to verify on every request, without a database round-trip.

## Decision

1. **Access token: short-lived JWT (15 min), kept in memory only.**
   - `HS256` with a secret of ≥ 32 characters (validated at boot), fixed algorithm list,
     `iss` and `aud` checked on verify. Payload is just `sub` (user id) and `role`.
   - Sent as `Authorization: Bearer …`. The SPA never writes it to `localStorage`.
   - A global `JwtAuthGuard` protects every route; open routes opt out with `@Public()`.

2. **Refresh token: opaque random value (256 bits), single use, 7 days.**
   - Delivered only as a cookie: `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`.
     JavaScript can't read it, and the browser only sends it to the auth endpoints.
   - Stored server-side **only as a SHA-256 hash** (`refresh_tokens.token_hash`), so a
     database leak does not hand out live sessions. A fast hash is enough because the
     token is high-entropy random data (unlike passwords).
   - **Rotation on every use:** `POST /auth/refresh` revokes the presented token
     (`revoked_at`, `replaced_by_id`) and issues a new one in the same `family_id`
     (one family = one login session).
   - **Reuse detection:** presenting a token that was already rotated or revoked revokes
     **every token in its family** and returns `401 REFRESH_TOKEN_REUSED`. Whoever holds
     the stolen copy and the legitimate user are both logged out; the user signs in again.
   - The lookup runs `SELECT … FOR UPDATE` inside a transaction, so two concurrent
     refreshes with the same token are serialized: exactly one succeeds (covered by an e2e test).

3. **Passwords: argon2id** (19 MiB, t=2, p=1 — OWASP baseline). Login failures always return
   the same `401 INVALID_CREDENTIALS`. For unknown emails and locked accounts a dummy hash
   is still verified so response times don't reveal which emails exist. After 5 failures
   the account is locked for 15 minutes (atomic counter in SQL; both values configurable).

4. **CSRF:** the refresh cookie is `SameSite=Strict` and path-scoped. As defence in depth,
   `refresh` and `logout` also reject a browser `Origin` that is neither an allowed origin
   (`CORS_ORIGINS`) nor the API's own origin (`403 UNTRUSTED_ORIGIN`).

## Consequences

- ✅ A stolen access token expires within 15 minutes. A stolen refresh token works at most
  once before the family is revoked, and the theft becomes visible (warning log).
- ✅ Verifying requests is stateless (signature + claims), with no DB hit per request.
- ⚠️ Access tokens can't be revoked before they expire (accepted for a 15-minute window).
  Logout revokes the refresh token, so the session can't be extended.
- ⚠️ Strict single use means two browser tabs refreshing at the same moment would trip
  reuse detection. The SPA must funnel refreshes through **one shared in-flight request**
  (planned in the Angular interceptor). A short grace period was considered and rejected
  for now in favour of simpler, stricter semantics.
- ⚠️ `SameSite=Strict` requires the SPA and API to share a site (same-origin rewrites in
  production). A cross-site deployment would need `SameSite=None` plus a CSRF token.
- ⚠️ `COOKIE_SECURE=false` is only for plain-http local development (Docker Compose).
- 🔜 Later stages: active-sessions list / remote logout (`/auth/sessions`), rate limiting,
  pruning expired tokens, optional TOTP step-up.
