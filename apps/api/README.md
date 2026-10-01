# api — Digital Wallet Ledger REST API

NestJS 11 + TypeORM + PostgreSQL. Global prefix: `/api/v1`.

## Scripts (run from the repo root with `pnpm --filter api <script>`)

| Script                                                 | Description                                   |
| ------------------------------------------------------ | --------------------------------------------- |
| `dev`                                                  | Start in watch mode                           |
| `build` / `start:prod`                                 | Compile to `dist/` / run the compiled app     |
| `lint` / `typecheck`                                   | ESLint / `tsc --noEmit`                       |
| `test` / `test:cov`                                    | Unit tests (Jest)                             |
| `test:e2e`                                             | E2E tests — needs PostgreSQL (`DATABASE_URL`) |
| `migration:run` / `migration:revert`                   | Apply / revert TypeORM migrations             |
| `migration:generate -- src/database/migrations/<Name>` | Generate a migration from entity changes      |

## Stage 0 contents

- `src/config/env.schema.ts` — environment validated with zod; the app refuses to start with an invalid env.
- `src/database/` — TypeORM `DataSource` (CLI) + `DatabaseModule`, baseline migration (`pgcrypto`, `citext`), `synchronize: false`.
- `src/modules/health/` — `GET /api/v1/health` (Terminus, database ping).
- Empty module folders (`auth`, `accounts`, `ledger`, `transfers`, ...) reserved per [`docs/STRUCTURE.md`](../../docs/STRUCTURE.md).
