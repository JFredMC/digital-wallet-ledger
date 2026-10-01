# ADR 0003 — Idempotency keys for money-moving requests

- **Status:** Accepted
- **Date:** 2026-10-01
- **Milestone:** Stage 1 / Transfers

## Context

Mobile networks drop responses. A client that sends `POST /transfers` and times out
can't tell whether the transfer happened. If it retries, a naive API charges twice. If
it doesn't, the user may think a payment went through when it didn't. Double-clicks and
proxies retrying on their own cause the same problem.

We need **at-most-once execution with a safe retry**: the same logical operation,
retried any number of times, possibly **concurrently**, moves money exactly once, and
every attempt gets the same answer.

## Decision

### 1. A required `Idempotency-Key` header on every money-moving `POST`

- Applies to `POST /transfers` and `POST /deposits`. Without the header the API returns
  `400 IDEMPOTENCY_KEY_REQUIRED`, and a malformed key returns `400 IDEMPOTENCY_KEY_INVALID`.
  A valid key is 8–255 characters from `[A-Za-z0-9._:-]`; a UUID v4 is recommended. The
  SPA generates one per user intent (per click on "Send") and reuses it for retries.
- Keys are scoped **per user**: `PRIMARY KEY (user_id, key)`. Two users can't collide,
  and one user can't probe another's keys.

### 2. Request fingerprint

Each key stores `scope` (e.g. `POST /transfers`) and `request_hash`, a SHA-256 of the
scope plus the **validated** body serialized as canonical JSON (keys sorted, undefined
fields dropped). On a repeat:

- same scope and hash → **replay** the stored response;
- anything else → `422 IDEMPOTENCY_KEY_REUSED`. A different body or endpoint under the
  same key is a client bug, and silently returning the old result would hide it.

### 3. The primary key is the lock, inside the business transaction

`IdempotencyService.execute(manager, request, handler)` runs **in the same transaction**
as the transfer or deposit:

```text
BEGIN
  INSERT INTO idempotency_keys … ON CONFLICT (user_id, key) DO UPDATE … WHERE expired
  RETURNING …                        ← claims the key, or waits for whoever holds it
  ├─ claimed     → handler(): lock accounts, check rules, post the journal
  │                UPDATE idempotency_keys SET response_status, response_body
  └─ not claimed → SELECT the stored row → replay it, or 422 if the fingerprint differs
COMMIT
```

- With two concurrent requests and the same key, the second `INSERT` **blocks on the
  first one's uncommitted row** (the unique-index check waits for the other
  transaction). When the first commits, the second sees the conflict, reads the
  committed response and replays it. No `IN_PROGRESS` state or polling is needed, and
  there is no window where both run.
- The response is stored in the transaction that moved the money, so "money moved" and
  "response stored" commit together or not at all.
- **Failures are not stored.** A business error (`INSUFFICIENT_FUNDS`, a limit, …) rolls
  back the whole transaction, key included, so the client can fix the cause and retry
  with **the same key**. Only `2xx` responses are replayed.
- Replays return the original status and body and add `Idempotent-Replayed: true`
  (exposed through CORS) so clients and logs can tell them apart.

### 4. Retention

- Keys live for `IDEMPOTENCY_KEY_TTL_HOURS` (default 24 h). That is far longer than any
  realistic retry window.
- An expired key is **taken over in place** by the same `INSERT … ON CONFLICT DO UPDATE
… WHERE expires_at <= now()`, so it acts like a new key. Clients should still use a
  new key for each new operation.
- Expired rows aren't deleted yet. A scheduled purge (`DELETE … WHERE expires_at <
now()`, backed by `ix_idempotency_keys_expires_at`) is planned for v1.

## How it fits with locking

Transfers go through `LedgerService`, which locks both wallets `FOR UPDATE` in id order
(see [ADR 0002](0002-double-entry-ledger.md)). The key row is always claimed **before**
any account lock, and each key belongs to a single request. A request blocked on a key
therefore holds no account locks, which keeps lock cycles out.

Everything inside the transaction uses the transaction's `EntityManager`. Borrowing a
second pool connection inside a transaction (for example, reading the recipient's name
through the default repository) **exhausts the pool under load**: every request holds
one connection while waiting for another. The 50-parallel-transfers e2e test caught
exactly this during development.

## Consequences

**Positive**

- Retries, double-clicks and concurrent duplicates are safe. The concurrency e2e suite
  fires 20 parallel requests with one key: all 20 get `201` with the same body, 19 are
  marked as replays, and money moves once.
- No extra infrastructure (Redis, distributed locks). PostgreSQL's unique index does
  the work, with the same ACID guarantees as the ledger.
- A tampered retry (same key, different amount) is rejected loudly.

**Negative / trade-offs**

- A request waiting on a duplicate holds a connection until the first finishes. That's
  fine for short transactions. A slow handler would make duplicates queue.
- Not storing failures means a retry after a failure may succeed later, for example
  after a top-up. That is intentional (it's a new attempt), but it differs from
  providers that cache 4xx responses too.
- Fingerprints use the validated DTO. Two bodies that normalize to the same DTO (e.g. a
  description with extra spaces) count as the same request.
- Storage grows with traffic until the purge job exists. One small row per write.

## Alternatives considered

- **Check-then-insert in application code:** has a race between the check and the
  insert. Two concurrent requests both see "no key" and both execute.
- **Separate `IN_PROGRESS` row committed before the work:** allows longer jobs, but
  needs a separate state machine, timeouts for crashed workers, and `409` handling.
  Too much for a single short ACID transaction.
- **Redis `SET NX`:** fast, but it's a second system whose state can diverge from the
  database (key set, transaction rolled back), and it's extra infrastructure on a free
  tier.
- **Natural deduplication (e.g. same amount + recipient within N seconds):** blocks
  legitimate repeated payments and still has races.
