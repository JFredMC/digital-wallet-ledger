import { HttpStatus } from '@nestjs/common';

/**
 * Catalogue of business/API error codes. Clients should branch on `code`,
 * never on the human-readable `detail`.
 */
export const ERROR_CATALOG = {
  VALIDATION_FAILED: { status: HttpStatus.BAD_REQUEST, title: 'Validation failed' },
  UNAUTHORIZED: { status: HttpStatus.UNAUTHORIZED, title: 'Unauthorized' },
  INVALID_CREDENTIALS: { status: HttpStatus.UNAUTHORIZED, title: 'Invalid credentials' },
  INVALID_REFRESH_TOKEN: { status: HttpStatus.UNAUTHORIZED, title: 'Invalid refresh token' },
  REFRESH_TOKEN_REUSED: { status: HttpStatus.UNAUTHORIZED, title: 'Refresh token reused' },
  UNTRUSTED_ORIGIN: { status: HttpStatus.FORBIDDEN, title: 'Untrusted origin' },
  FORBIDDEN: { status: HttpStatus.FORBIDDEN, title: 'Forbidden' },
  NOT_FOUND: { status: HttpStatus.NOT_FOUND, title: 'Not found' },
  EMAIL_ALREADY_REGISTERED: { status: HttpStatus.CONFLICT, title: 'Email already registered' },
  ACCOUNT_NOT_FOUND: { status: HttpStatus.NOT_FOUND, title: 'Account not found' },
  ACCOUNT_NOT_ACTIVE: { status: HttpStatus.UNPROCESSABLE_ENTITY, title: 'Account not active' },
  CURRENCY_MISMATCH: { status: HttpStatus.UNPROCESSABLE_ENTITY, title: 'Currency mismatch' },
  INSUFFICIENT_FUNDS: { status: HttpStatus.UNPROCESSABLE_ENTITY, title: 'Insufficient funds' },
  DEPOSITS_DISABLED: { status: HttpStatus.FORBIDDEN, title: 'Deposits disabled' },
  DAILY_DEPOSIT_LIMIT_EXCEEDED: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    title: 'Daily deposit limit exceeded',
  },
  RECIPIENT_NOT_FOUND: { status: HttpStatus.NOT_FOUND, title: 'Recipient not found' },
  SAME_ACCOUNT_TRANSFER: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    title: 'Cannot transfer to the same account',
  },
  TRANSFER_LIMIT_EXCEEDED: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    title: 'Transfer limit exceeded',
  },
  DAILY_TRANSFER_LIMIT_EXCEEDED: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    title: 'Daily transfer limit exceeded',
  },
  IDEMPOTENCY_KEY_REQUIRED: {
    status: HttpStatus.BAD_REQUEST,
    title: 'Idempotency-Key header required',
  },
  IDEMPOTENCY_KEY_INVALID: { status: HttpStatus.BAD_REQUEST, title: 'Invalid Idempotency-Key' },
  /** Same key, different request: a client bug, never silently replayed. */
  IDEMPOTENCY_KEY_REUSED: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    title: 'Idempotency-Key reused with a different request',
  },
  INVALID_CURSOR: { status: HttpStatus.BAD_REQUEST, title: 'Invalid pagination cursor' },
  /** A bug: the code tried to post a journal that breaks double-entry rules. */
  LEDGER_INVARIANT_VIOLATION: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    title: 'Ledger invariant violation',
  },
  INTERNAL_ERROR: { status: HttpStatus.INTERNAL_SERVER_ERROR, title: 'Internal server error' },
} as const satisfies Record<string, { status: HttpStatus; title: string }>;

export type ErrorCode = keyof typeof ERROR_CATALOG;
