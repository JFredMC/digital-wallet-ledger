# ADR 0004 — Web demo on GitHub Pages with an in-browser mock backend

- **Status:** Accepted
- **Date:** 2026-10-01
- **Milestone:** Stage 1 / Web demo (before the Stage 2 API deploy)

## Context

The Angular app is finished, but the API (NestJS + PostgreSQL) is not deployed yet. We
want a public, always-on demo that recruiters can open without waking up a free-tier
server. GitHub Pages hosts static files only: no API, no cookies set by a server and no
SPA rewrites. When the API is deployed later, the same SPA must talk to it with no code
changes in its features.

## Decision

1. **Build-time switch, not a runtime flag.** `ng build -c demo` replaces
   `src/environments/environment.ts` with `environment.demo.ts`. The demo environment adds
   one functional interceptor (`demoBackendInterceptor`) **after** `authInterceptor` and
   provides the `DEMO_MODE` token. The default build never imports the demo code, so the
   real-API bundle stays the same (checked: no demo strings in `ng build` output).
2. **Mock at the HTTP boundary.** The interceptor answers every `/api/v1/*` request with
   `DemoBackend`, which implements the **same contract** as the API: routes, JSON shapes,
   status codes, problem+json bodies (`type`, `title`, `code`, `requestId`, extensions such
   as `remainingMinor`), `Idempotency-Key` semantics (replay with `Idempotent-Replayed`,
   `422 IDEMPOTENCY_KEY_REUSED`, failures not stored), the same limits, masking, filters
   and keyset-style cursors. Services, guards, the single-flight refresh and the retry
   logic run unchanged, so the demo also exercises them.
3. **Persistence in `localStorage`.** Each request reads the JSON database, works on that
   copy and writes it back only on success, so a failed request leaves no partial changes.
   Passwords are stored as salted PBKDF2 hashes, never in plain text. The "refresh cookie"
   is a session record in the same storage; access tokens expire after 15 minutes, as in
   the API, which triggers the real refresh flow.
4. **Sample data through the same rules.** Three users (Ana María Gómez, Luis Alberto
   Pérez, Valentina Rojas, password `Demo1234`) with two weeks of history are created by
   the same posting functions as live requests, older than 24 h so the daily limits start
   fresh. "Restablecer demo" rebuilds this data.
5. **GitHub Pages specifics.** `baseHref` is `/digital-wallet-ledger/`. Path routing is
   kept (clean URLs, same routes as the real build); `index.html` is copied to `404.html`
   so deep links and reloads boot the SPA. A workflow builds and deploys with
   `actions/deploy-pages` on every push to `main`. CI runs a Playwright smoke against the
   demo build served the way Pages serves it.

## Consequences

- ✅ A free, instant, public demo; the real API path is untouched and selected by the
  build configuration.
- ✅ The mock is covered by unit tests against the API contract, so drift is visible.
- ⚠️ Two implementations of the business rules can drift. The API remains the source of
  truth; when the contract changes, `DemoBackend` and its tests must change too.
- ⚠️ Deep links on Pages return HTTP 404 (with the app) before the router takes over.
  Users don't notice; crawlers might. Acceptable for a demo.
- ⚠️ The demo shows no server-side guarantees (row locking, DB constraints). Those are
  shown by the API test suite, not the demo.
