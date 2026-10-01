# web — Digital Wallet Ledger SPA

Angular 22 (standalone components, signals, zoneless), SCSS, Vitest, Playwright. The UI is in
Spanish and formats money as COP (`$ 25.000`, centavos only when present).

## Scripts (run from the repo root with `pnpm --filter web <script>`)

| Script               | Description                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `dev` / `start`      | `ng serve` on http://localhost:4200, proxying `/api` → http://localhost:3000 (`proxy.conf.json`) |
| `build`              | Production build to `dist/web/browser`                                                           |
| `lint` / `typecheck` | angular-eslint / `tsc --noEmit` (app, specs and e2e)                                             |
| `test`               | Unit tests (Vitest via `@angular/build:unit-test`)                                               |
| `e2e`                | Playwright (desktop Chrome + Pixel 7) against a running stack, `E2E_BASE_URL` (default :4200)    |
| `dev:demo`           | Demo mode with live reload on http://localhost:4300 (in-browser backend, no API needed)          |
| `build:pages`        | GitHub Pages build: `-c demo`, base href `/digital-wallet-ledger/`, `404.html` + `.nojekyll`     |
| `serve:pages`        | Serves `dist/web/browser` like GitHub Pages (base path, `404.html` fallback) on :4300            |
| `e2e:demo`           | Playwright smoke of the Pages build (`DEMO_BASE_URL=<live url>` to test the live site)           |

`PW_CHANNEL=chrome` makes Playwright use an installed Google Chrome instead of its own Chromium.

## Demo mode (GitHub Pages)

Live: **https://jfredmc.github.io/digital-wallet-ledger/**. `ng build -c demo` swaps
`src/environments/environment.ts` for `environment.demo.ts`, which appends
`demoBackendInterceptor` after `authInterceptor` and provides `DEMO_MODE`. The interceptor
answers `/api/v1/*` with `DemoBackend` (`src/app/demo/`): the same contract as the API,
persisted to `localStorage` (key `billetera-demo:db`). The UI shows "Modo demo · datos
simulados", a "Restablecer demo" button and, on the login screen, the sample accounts
(`ana@billetera.demo`, `luis@billetera.demo`, `valentina@billetera.demo`, password
`Demo1234`). The default build does not include any of this. See
[ADR 0004](../../docs/adr/0004-github-pages-demo-mode.md).
README screenshots: `SCREENSHOTS_DIR=$PWD/../../docs/screenshots pnpm e2e screenshots` (skipped otherwise).

In Docker the build is served by nginx (`nginx.conf`: SPA fallback + `/api` proxy to the `api` service).

## Screens and routes

| Route          | Screen                                                                              | Guard        |
| -------------- | ----------------------------------------------------------------------------------- | ------------ |
| `/ingresar`    | Login (`?returnUrl=` honored only for same-app paths, `?sesion=expirada` notice)    | `guestGuard` |
| `/registro`    | Register                                                                            | `guestGuard` |
| `/inicio`      | Dashboard: balance, account number (copy), quick actions, last 5 movements          | `authGuard`  |
| `/depositar`   | Sandbox top-up with quick amounts                                                   | `authGuard`  |
| `/transferir`  | Recipient lookup (account number or alias) → amount → confirm → receipt             | `authGuard`  |
| `/movimientos` | History: type, direction, date and amount filters; "Cargar más" (cursor pagination) | `authGuard`  |

## How the client handles sessions and money

- **Access token in memory only** (`AuthService`, a signal). Nothing is written to
  `localStorage`/`sessionStorage`; after a reload `authGuard` restores the session from the
  `HttpOnly` refresh cookie.
- **Single-flight refresh** (`authInterceptor` + `AuthService.refresh()`): on a `401` the
  interceptor calls `/auth/refresh` once, shared by every request that failed meanwhile, then
  replays each original request with its original headers. A replayed request that fails again is
  returned to the caller (no loops); a failed refresh expires the session and sends the user to
  `/ingresar?sesion=expirada&returnUrl=…`. Refreshes are serialized across tabs with the Web
  Locks API, because the refresh token is single-use with reuse detection.
- **Idempotency-Key per submit** (`IdempotencyKeyTracker`): a deposit or transfer gets a new UUID
  per intent; "Reintentar" after a network error, `5xx` or `429` resends the **same payload with
  the same key**, so a lost response can never move money twice. The key changes when the payload
  changes and after a success.
- **Errors**: RFC 9457 `problem+json` bodies are mapped by `code` to Spanish messages
  (`toProblem`), including amounts from extensions such as `remainingMinor`.

## Layout

```text
src/app/
  core/       api (typed client, wire models), auth (service, guards, cross-tab lock),
              http (interceptor, problem mapping), state (wallet store), layout (shell)
  shared/     utils (money, dates, validators, idempotency keys), pipes (cop), ui components
  features/   auth, dashboard, deposits, transfers, transactions
  demo/       in-browser backend for the demo build (db, seed, routes, interceptor)
src/environments/  environment.ts (real API) / environment.demo.ts (demo build)
src/testing/  test fixtures (excluded from the app build)
e2e/          Playwright specs (*.e2e.ts: real stack; *.demo.ts: Pages demo build)
scripts/      Pages post-build (404.html) and a local Pages-like static server
```
