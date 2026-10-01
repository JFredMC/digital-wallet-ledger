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
  INTERNAL_ERROR: { status: HttpStatus.INTERNAL_SERVER_ERROR, title: 'Internal server error' },
} as const satisfies Record<string, { status: HttpStatus; title: string }>;

export type ErrorCode = keyof typeof ERROR_CATALOG;
