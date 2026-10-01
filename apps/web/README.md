# web — Digital Wallet Ledger SPA

Angular 22 (standalone components, signals, zoneless), SCSS, Vitest.

## Scripts (run from the repo root with `pnpm --filter web <script>`)

| Script               | Description                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `dev` / `start`      | `ng serve` on http://localhost:4200, proxying `/api` → http://localhost:3000 (`proxy.conf.json`) |
| `build`              | Production build to `dist/web/browser`                                                           |
| `lint` / `typecheck` | angular-eslint / `tsc --noEmit`                                                                  |
| `test`               | Unit tests (Vitest via `@angular/build:unit-test`)                                               |

In Docker the build is served by nginx (`nginx.conf`: SPA fallback + `/api` proxy to the `api` service).

Folder layout (`core/`, `shared/`, `features/*`) follows [`docs/STRUCTURE.md`](../../docs/STRUCTURE.md); feature folders are empty in Stage 0.
