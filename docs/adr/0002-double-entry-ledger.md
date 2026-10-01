# ADR 0002 — Double-entry, append-only ledger with materialized balances

- **Status:** Accepted
- **Date:** 2026-10-01
- **Milestone:** Stage 1 / Accounts + ledger

## Context

A wallet has one job: **never lose, create or duplicate money**. That has to hold even
with concurrent requests, partial failures and code bugs. We also need:

- an audit trail that explains every balance ("why do I have this much?");
- cheap balance reads (the dashboard shows them on every load);
- a way to detect it if a balance ever drifts from its history;
- room to grow into transfers, fees and reversals without changing the model.

A single mutable `balance` column per user can't explain itself and can't be checked.
Storing only movements makes every balance read an aggregation.

## Decision

### 1. Money is an integer number of minor units

- PostgreSQL `BIGINT` (`balance_minor`, `amount_minor`, `balance_after_minor`). No floats or
  `NUMERIC` in the domain.
- TypeScript works with `bigint` (a TypeORM transformer maps the column). JSON uses plain
  integers. The API rejects amounts above `Number.MAX_SAFE_INTEGER`, so a JSON number never
  loses precision. Every response field is named `…Minor` so clients can't mistake it for
  pesos.
- The MVP has one currency, `COP`. Every account and every ledger line still carries
  `currency`, so adding another currency is a data change, not a schema change.

### 2. Double-entry bookkeeping

- `journal_entries` is one business event (`DEPOSIT`, `TRANSFER`, `FEE`, `REVERSAL`).
- `ledger_entries` holds its lines (`DEBIT`/`CREDIT`, positive `amount_minor`), at least
  two per journal, **Σ DEBIT = Σ CREDIT per currency**.
- One convention for every account type: **balance = Σ CREDIT − Σ DEBIT**.
- Money enters the system from the `SYSTEM_FUNDING` account. A demo deposit is
  `DEBIT SYSTEM_FUNDING / CREDIT user wallet`, so `SYSTEM_FUNDING` goes negative by exactly
  the amount of demo money in circulation. **The sum of all balances is always 0.**
  `SYSTEM_FEES` is seeded for later use.
- Each ledger line stores `balance_after_minor`, a running balance. Statements and
  history then need no window functions, and a single line can be checked on its own.

### 3. The database enforces the invariants

Application rules come first and give friendly errors (RFC 9457). The schema is the last
line of defence:

| Invariant                                | Mechanism                                                                                                                    |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| History is immutable                     | `BEFORE UPDATE OR DELETE` triggers on `journal_entries` and `ledger_entries` raise an error                                  |
| Every journal balances                   | `DEFERRABLE INITIALLY DEFERRED` constraint trigger: at COMMIT, each touched journal has ≥ 2 lines and nets to 0 per currency |
| A wallet is never overdrawn              | `CHECK (type <> 'USER_WALLET' OR balance_minor >= 0)`                                                                        |
| Lines are in their account's currency    | Composite FK `(account_id, currency) → accounts (id, currency)`                                                              |
| Amounts are positive                     | `CHECK (amount_minor > 0)`                                                                                                   |
| One wallet per user and currency         | Partial unique index on `accounts (user_id, currency) WHERE type = 'USER_WALLET'`                                            |
| One system account per type and currency | Partial unique index on `accounts (type, currency) WHERE type <> 'USER_WALLET'`                                              |

The balance trigger is deferred because the lines of a journal are inserted one by one.
Checking at COMMIT lets the whole journal exist before it is validated.

### 4. Materialized balances, a single writer

- `accounts.balance_minor` is a **cache** of the ledger, updated in the **same
  transaction** as the lines that change it. Reads are a primary-key lookup.
- `LedgerService.post(manager, { type, description, lines })` is the **only** code path
  that inserts ledger rows or touches balances. Use cases (deposits now, transfers in
  the next milestone) open the transaction and pass in their `EntityManager`, so the
  posting is atomic with the rest of the use case.
- `post()` validates the journal shape, locks the accounts, checks the domain rules
  (account exists, is `ACTIVE`, currencies match, wallets stay ≥ 0), writes the journal,
  updates balances (`version + 1`) and inserts the lines with their `balance_after_minor`.
- `LedgerService.findBalanceMismatches()` recomputes every balance from the ledger and
  lists the accounts whose cache disagrees. The e2e suites run it after each test, along
  with "Σ balances = 0". A scheduled reconciliation job (v1) will reuse it.

### 5. Locking: pessimistic, in a deterministic order

- Accounts are locked with `SELECT … FOR UPDATE`, **sorted by id**, at the default
  `READ COMMITTED` isolation. Two postings that touch the same accounts always take the
  locks in the same order, so they queue instead of deadlocking.
- Business checks that depend on other rows run **after** taking the locks. An example
  is the rolling 24-hour deposit limit, which sums the user's past deposits. The wallet
  lock serializes deposits for that user, so concurrent requests can't all pass the check.
  The e2e suite fires parallel deposits against the limit to prove it.
- Optimistic locking (`version`) was not chosen. Under contention it turns into retries
  in every caller. Pessimistic locks keep the code linear, and the `version` column is
  still bumped for auditing and future use.

### 6. Wallet creation is part of registration

`AuthService.register` creates the user and their COP wallet in **one transaction**. A
user without a wallet can't exist, and a failure in either step rolls back both.

## Consequences

**Positive**

- Every balance can be explained line by line and checked at any time.
- A whole class of bugs (an unbalanced posting, editing history, an overdraft from a race)
  is rejected by PostgreSQL even if the application code is wrong.
- Transfers, fees and reversals are just new journal types over the same `post()`.

**Negative / trade-offs**

- **Hot row:** every deposit locks `SYSTEM_FUNDING`, so deposits are serialized
  system-wide. That's fine for a demo with capped sandbox top-ups. At scale the options
  are sharded funding accounts, or not locking/updating the system account and deriving
  its balance from the ledger.
- **No corrections in place:** a mistake is fixed with a compensating `REVERSAL` journal,
  never an `UPDATE`. That is intentional, but the API has to expose it (planned).
- **Triggers don't stop everything:** `TRUNCATE` and the table owner can still bypass
  them. Production should run the API under a least-privilege role (`INSERT`/`SELECT` on
  the ledger tables only) and keep migrations under a separate owner role.
- **Write amplification:** a posting is 1 journal + N lines + N balance updates. That is
  acceptable at this volume and buys cheap reads.
- `balance_after_minor` is only correct because of the row lock. Any future writer that
  bypasses `LedgerService` would corrupt it. The reconciliation query exists to catch that.

## Alternatives considered

- **Single mutable balance column:** simplest, but it can't be audited or reconciled.
- **Balances computed on the fly from the ledger:** always consistent, but every read
  aggregates, and overdraft checks need the same locks anyway.
- **`SERIALIZABLE` isolation instead of explicit locks:** correct, but serialization
  failures need retry loops in every caller and are harder to reason about under load.
- **`NUMERIC(19,4)` amounts:** exact, but slower and easy to mix up with JS floats.
  Integer minor units already represent cents exactly.
