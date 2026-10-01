<div align="center">

# 💸 Digital Wallet Ledger

**A full-stack digital wallet with a double-entry ledger, idempotent P2P transfers and JWT refresh-token auth.**

[![CI](https://github.com/JFredMC/digital-wallet-ledger/actions/workflows/ci.yml/badge.svg)](https://github.com/JFredMC/digital-wallet-ledger/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/badge/coverage-TODO-lightgrey)](#-testing)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)
![Angular](https://img.shields.io/badge/Angular-22-DD0031?logo=angular&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)

**Live demo:** _TODO_ · **API docs (Swagger):** _TODO_ · [**Architecture decisions**](docs/adr) · [**Project plan**](docs/PLAN.md)

</div>

> 🇨🇴 **Nota en español:** Proyecto de portafolio de una billetera digital (estilo fintech) construida con NestJS, PostgreSQL y Angular. Implementa un libro mayor de doble partida, transferencias P2P con transacciones ACID y claves de idempotencia, y autenticación JWT con refresh tokens rotativos. El dinero de la demo es ficticio. El plan completo está en [`docs/PLAN.md`](docs/PLAN.md) y la estructura en [`docs/STRUCTURE.md`](docs/STRUCTURE.md).

---

> 🚧 **Project status — Stage 0 (foundations).** The monorepo, Docker Compose stack, validated configuration, TypeORM baseline migration, `GET /api/v1/health` and CI are in place. The features below describe the planned scope and are being built stage by stage (see the [roadmap](#️-roadmap)).

## 📖 About

Digital Wallet Ledger is a portfolio project that tackles the problems that matter in fintech: **money must never be lost, duplicated or out of balance** — even under concurrent requests and flaky mobile networks.

> ⚠️ **Demo only.** This is not a licensed financial product: no real money, KYC or payment-network integration.

> ⏱️ **Heads-up (once deployed):** the API will run on a free tier that sleeps after inactivity. The first request may take ~1 minute to wake it up.

## ✨ Features (planned)

- 🔐 **Auth** — short-lived JWT access tokens + rotating refresh tokens (hashed, `HttpOnly` cookie) with reuse detection that revokes the whole token family.
- 👛 **Accounts & balances** — one COP wallet per user, amounts stored as **integer minor units** (`BIGINT`), never floats.
- 🔁 **P2P transfers** — single ACID transaction, **row-level locking** (`SELECT … FOR UPDATE`, deterministic lock order to avoid deadlocks) and mandatory **`Idempotency-Key`** header (safe retries, no double charges).
- 📒 **Double-entry ledger** — immutable, append-only journal; every entry balances (Σ debits = Σ credits); balances are reconcilable at any time.
- 🧾 **Transaction history** — filters (type, direction, date and amount ranges, text) with **cursor (keyset) pagination**.
- 📚 **OpenAPI / Swagger** docs with examples and RFC 9457 error responses.
- 🧪 **Tests** — unit + e2e against a real PostgreSQL, including a **concurrency test** (50 parallel transfers, zero overdrafts).
- 🐳 **Docker Compose** for a one-command local setup and **GitHub Actions** CI/CD.
- 🅰️ **Modern Angular** — standalone components, signals, new control flow, functional interceptors/guards, zoneless.

## 🏗️ Architecture

```mermaid
flowchart LR
    user([User browser])
    subgraph FE["Frontend - Vercel / Netlify"]
        web["Angular SPA<br/>signals, standalone"]
    end
    subgraph BE["Backend - Render"]
        api["NestJS REST API<br/>/api/v1"]
        subgraph mods["Modules"]
            auth[Auth]
            acc[Accounts]
            trf[Transfers]
            led[Ledger]
            idem[Idempotency]
            txq[Transactions query]
        end
    end
    db[("PostgreSQL<br/>Neon")]
    gha["GitHub Actions<br/>CI/CD"]

    user --> web
    web -- "/api/* rewrite (same origin)" --> api
    api --> mods
    mods --> db
    gha -- "test, build, deploy" --> web
    gha -- "deploy hook" --> api
```

<details>
<summary><b>Transfer flow (idempotency + row locking)</b></summary>

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant API as NestJS
    participant DB as PostgreSQL
    C->>API: POST /transfers (Idempotency-Key)
    API->>DB: BEGIN
    API->>DB: INSERT idempotency key (ON CONFLICT DO NOTHING)
    alt key already used
        API-->>C: stored response (same transfer id)
    else new key
        API->>DB: SELECT accounts ... ORDER BY id FOR UPDATE
        API->>DB: INSERT journal + 2 ledger entries, UPDATE balances
        API->>DB: INSERT transfer, store response
        API->>DB: COMMIT
        API-->>C: 201 Created
    end
```

</details>

## 🛠️ Tech Stack

| Layer    | Technologies                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Backend  | NestJS 11, TypeScript (strict), TypeORM, zod (config), Terminus (health), helmet · _planned:_ class-validator, Passport JWT, argon2, nestjs-pino |
| Database | PostgreSQL 16 (CHECK constraints, partial indexes, append-only triggers)                                                                         |
| Frontend | Angular 22 (standalone, signals, zoneless), SCSS · _planned:_ Angular Material                                                                   |
| Testing  | Jest + Supertest (API), Vitest (web) · _planned:_ Testcontainers, Playwright                                                                     |
| DevOps   | Docker, Docker Compose, GitHub Actions · _planned:_ Render, Neon, Vercel/Netlify                                                                 |
| Tooling  | Node.js 24 LTS, pnpm workspaces, ESLint (typescript-eslint, angular-eslint), Prettier · _planned:_ Husky, commitlint                             |

## 🚀 Getting Started

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) + Docker Compose v2
- (Optional, for local dev without Docker) Node.js 24 LTS and pnpm 10 (`corepack enable` picks the version pinned in `package.json`)

### Run with Docker Compose

```bash
git clone https://github.com/JFredMC/digital-wallet-ledger.git
cd digital-wallet-ledger
cp .env.example .env          # adjust secrets if needed
docker compose up --build
```

| Service      | URL                                        |
| ------------ | ------------------------------------------ |
| Web app      | http://localhost:4200                      |
| API          | http://localhost:3000/api/v1               |
| Health check | http://localhost:3000/api/v1/health        |
| Swagger UI   | http://localhost:3000/api/docs _(planned)_ |

The API runs pending migrations on start-up (`DATABASE_MIGRATIONS_RUN=true` in Compose). The web container (nginx) proxies `/api/*` to the API, mirroring the same-origin setup used in production.

Seed demo data: _TODO (MVP stage)_ — `docker compose exec api pnpm seed`

Demo credentials: _TODO_

### Local development (without Docker for the apps)

```bash
pnpm install
cp .env.example .env
docker compose up -d postgres
pnpm --filter api migration:run
pnpm dev                      # API on :3000, Angular on :4200 (proxy /api → :3000)
```

### Root scripts

| Script                              | Description                                |
| ----------------------------------- | ------------------------------------------ |
| `pnpm dev`                          | API (watch) + web (`ng serve`) in parallel |
| `pnpm build`                        | Build every app                            |
| `pnpm lint` / `pnpm typecheck`      | ESLint / TypeScript across the monorepo    |
| `pnpm test`                         | Unit tests (API + web)                     |
| `pnpm test:e2e`                     | API e2e tests (needs PostgreSQL)           |
| `pnpm format` / `pnpm format:check` | Prettier                                   |

## 🔑 Environment Variables

| Variable                         | Description                                                   | Example                                          |
| -------------------------------- | ------------------------------------------------------------- | ------------------------------------------------ |
| `NODE_ENV`                       | Runtime environment                                           | `development`                                    |
| `PORT`                           | API port                                                      | `3000`                                           |
| `DATABASE_URL`                   | PostgreSQL connection string (**required**)                   | `postgres://wallet:wallet@localhost:5432/wallet` |
| `DATABASE_SSL`                   | Enable SSL (required for Neon)                                | `false`                                          |
| `DATABASE_MIGRATIONS_RUN`        | Run pending migrations on API start-up                        | `false` (local) / `true` (Compose)               |
| `CORS_ORIGINS`                   | Comma-separated allowed origins                               | `http://localhost:4200`                          |
| `LOG_LEVEL`                      | Log level                                                     | `info`                                           |
| `JWT_ACCESS_SECRET`              | _(planned)_ Secret for access tokens (≥ 32 bytes)             | `openssl rand -base64 48`                        |
| `JWT_ACCESS_TTL`                 | _(planned)_ Access token lifetime                             | `15m`                                            |
| `REFRESH_TOKEN_TTL_DAYS`         | _(planned)_ Refresh token lifetime                            | `7`                                              |
| `COOKIE_SECURE`                  | _(planned)_ `Secure` flag on cookies                          | `false` (local) / `true` (prod)                  |
| `MAX_TRANSFER_MINOR`             | _(planned)_ Max amount per transfer (minor units)             | `500000000`                                      |
| `DAILY_TRANSFER_LIMIT_MINOR`     | _(planned)_ Daily limit per user (minor units)                | `2000000000`                                     |
| `DEMO_DEPOSITS_ENABLED`          | _(planned)_ Enable sandbox top-ups                            | `true`                                           |
| `DEMO_DEPOSIT_DAILY_LIMIT_MINOR` | _(planned)_ Max sandbox top-up per user per day (minor units) | `100000000`                                      |
| `IDEMPOTENCY_KEY_TTL_HOURS`      | _(planned)_ Idempotency key retention                         | `24`                                             |

The API validates its environment with zod at start-up and refuses to boot with a clear message if something is missing or invalid.

> Never commit `.env`. See [`.env.example`](.env.example).

## 📚 API Documentation

- Interactive docs: **`/api/docs`** (Swagger UI) — _planned_ · live: _TODO_
- OpenAPI JSON: **`/api/docs-json`** — _planned_

| Method | Endpoint                            | Description                                   | Status     |
| ------ | ----------------------------------- | --------------------------------------------- | ---------- |
| `GET`  | `/api/v1/health`                    | Liveness + database ping                      | ✅ Stage 0 |
| `POST` | `/api/v1/auth/register`             | Create user + wallet                          | Planned    |
| `POST` | `/api/v1/auth/login`                | Log in                                        | Planned    |
| `POST` | `/api/v1/auth/refresh`              | Rotate refresh token                          | Planned    |
| `GET`  | `/api/v1/accounts`                  | My accounts and balances                      | Planned    |
| `POST` | `/api/v1/transfers`                 | P2P transfer (**requires `Idempotency-Key`**) | Planned    |
| `GET`  | `/api/v1/accounts/:id/transactions` | History with filters + cursor pagination      | Planned    |

```bash
curl http://localhost:3000/api/v1/health
# {"status":"ok","info":{"database":{"status":"up"}},"error":{},"details":{"database":{"status":"up"}}}
```

## 🧪 Testing

```bash
pnpm test                     # unit tests (API: Jest, web: Vitest)
pnpm test:e2e                 # API e2e against a real PostgreSQL (DATABASE_URL)
pnpm --filter api test:cov    # API coverage report
```

CI (GitHub Actions) runs lint, typecheck, unit tests and builds for both apps, the API e2e suite against a PostgreSQL 16 service container, and a Docker Compose smoke test.

Planned highlights:

- ✅ Ledger invariants: every journal entry balances; balances match the ledger.
- ✅ Idempotency: same key → same response, single debit; same key + different body → `422`.
- ✅ Concurrency: 50 parallel transfers from one account never overdraw it and never deadlock.
- ✅ Refresh token reuse detection revokes the whole session family.

## 🧭 Design Decisions

Short ADRs will live in [`docs/adr`](docs/adr):

1. Money as integer minor units (`BIGINT`)
2. Double-entry, append-only ledger + materialized balances
3. Idempotency keys with a unique index as a natural lock
4. Pessimistic row locking with deterministic ordering (`READ COMMITTED`)
5. Rotating refresh tokens in `HttpOnly` cookies, served same-origin via rewrites

## 🗺️ Roadmap

- [x] **Stage 0** — project setup: pnpm monorepo, Docker Compose, validated config, TypeORM baseline, `/health`, CI _(Husky + commitlint pending)_
- [ ] **MVP** — auth (JWT + refresh), wallets, sandbox deposits, idempotent P2P transfers, double-entry ledger, history, Swagger, tests, deploy
- [ ] **v1** — advanced filters, receipts, RFC 9457 errors, reconciliation job, active sessions, daily limits, Playwright, CD
- [ ] Rate limiting
- [ ] Audit log
- [ ] Two-factor authentication (TOTP)
- [ ] Webhooks (transactional outbox + HMAC signatures)
- [ ] Real-time notifications (SSE)
- [ ] Reversals / refunds

## 📸 Screenshots

> 🚧 **TODO — screenshots will be added once the UI exists** (saved in `docs/screenshots/`).

## 📁 Project Structure

```text
apps/
  api/        NestJS REST API (config, database, health; auth, accounts, ledger, transfers... reserved)
  web/        Angular SPA (core, shared, features/*)
packages/     Shared packages (api-contracts, tsconfig) — planned
docker/       Postgres init scripts
docs/         Plan, structure, ADRs, screenshots
.github/      CI workflow, Dependabot, PR template
```

Full layout and module responsibilities: [`docs/STRUCTURE.md`](docs/STRUCTURE.md).

## 👤 Author

**Jhon Maquilon** — Full Stack Developer (Angular · NestJS · Rails · PostgreSQL)

- GitHub: [@JFredMC](https://github.com/JFredMC)
- LinkedIn: [linkedin.com/in/jfredmc](https://www.linkedin.com/in/jfredmc/)
- Portfolio: [jfredmc.github.io/portfolio](https://jfredmc.github.io/portfolio/)

## 📄 License

This project is licensed under the [MIT License](LICENSE).
