# Architecture Decision Records

Short records of the decisions that shape this codebase, in the format
_Context → Decision → Consequences_. New ADRs are numbered sequentially and never
rewritten; a superseding ADR links back to the one it replaces.

| #                                                      | Title                                                             | Status   |
| ------------------------------------------------------ | ----------------------------------------------------------------- | -------- |
| [0001](0001-jwt-access-and-rotating-refresh-tokens.md) | JWT access tokens + rotating refresh tokens in an HttpOnly cookie | Accepted |
| [0002](0002-double-entry-ledger.md)                    | Double-entry, append-only ledger with materialized balances       | Accepted |
| [0003](0003-idempotency-keys.md)                       | Idempotency keys for money-moving requests                        | Accepted |
