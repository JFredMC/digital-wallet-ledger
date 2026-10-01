# Architecture Decision Records

Short records of the decisions that shape this codebase, in the format
_Context → Decision → Consequences_. New ADRs are numbered sequentially and never
rewritten; a superseding ADR links back to the one it replaces.

| #                                                      | Title                                                             | Status   |
| ------------------------------------------------------ | ----------------------------------------------------------------- | -------- |
| [0001](0001-jwt-access-and-rotating-refresh-tokens.md) | JWT access tokens + rotating refresh tokens in an HttpOnly cookie | Accepted |

Planned (per [`docs/PLAN.md`](../PLAN.md)): money as integer minor units, double-entry
append-only ledger, idempotency keys, pessimistic row locking for transfers.
