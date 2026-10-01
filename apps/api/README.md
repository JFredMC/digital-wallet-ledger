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

## Contents

- `src/config/env.schema.ts` — environment validated with zod; the app refuses to start with an invalid env.
- `src/database/` — TypeORM `DataSource` (CLI) + `DatabaseModule`, hand-written SQL migrations, `synchronize: false`.
- `src/common/` — RFC 9457 `ProblemDetailsFilter` + `DomainError` codes, `X-Request-Id` middleware, global `JwtAuthGuard` with `@Public()`, `@CurrentUser()`.
- `src/modules/health/` — `GET /api/v1/health` (Terminus, database ping).
- `src/modules/users/` — `users` entity/service (citext email, failed-login counter + temporary lock).
- `src/modules/auth/` — register/login/refresh/logout/me, argon2id passwords, JWT access tokens, rotating refresh tokens with reuse detection ([ADR 0001](../../docs/adr/0001-jwt-access-and-rotating-refresh-tokens.md)).
- Swagger UI at `/api/docs` (OpenAPI JSON at `/api/docs-json`).
- Remaining module folders (`accounts`, `ledger`, `transfers`, ...) are reserved per [`docs/STRUCTURE.md`](../../docs/STRUCTURE.md).
