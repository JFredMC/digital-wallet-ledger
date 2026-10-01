/** Same codes, statuses and titles as the API's ERROR_CATALOG (apps/api/src/common/errors). */
const CATALOG = {
  VALIDATION_FAILED: [400, 'Validation failed'],
  UNAUTHORIZED: [401, 'Unauthorized'],
  INVALID_CREDENTIALS: [401, 'Invalid credentials'],
  INVALID_REFRESH_TOKEN: [401, 'Invalid refresh token'],
  NOT_FOUND: [404, 'Not found'],
  EMAIL_ALREADY_REGISTERED: [409, 'Email already registered'],
  ACCOUNT_NOT_FOUND: [404, 'Account not found'],
  INSUFFICIENT_FUNDS: [422, 'Insufficient funds'],
  DAILY_DEPOSIT_LIMIT_EXCEEDED: [422, 'Daily deposit limit exceeded'],
  RECIPIENT_NOT_FOUND: [404, 'Recipient not found'],
  SAME_ACCOUNT_TRANSFER: [422, 'Cannot transfer to the same account'],
  TRANSFER_LIMIT_EXCEEDED: [422, 'Transfer limit exceeded'],
  DAILY_TRANSFER_LIMIT_EXCEEDED: [422, 'Daily transfer limit exceeded'],
  IDEMPOTENCY_KEY_REQUIRED: [400, 'Idempotency-Key header required'],
  IDEMPOTENCY_KEY_INVALID: [400, 'Invalid Idempotency-Key'],
  IDEMPOTENCY_KEY_REUSED: [422, 'Idempotency-Key reused with a different request'],
  INVALID_CURSOR: [400, 'Invalid pagination cursor'],
  INTERNAL_ERROR: [500, 'Internal server error'],
} as const satisfies Record<string, readonly [number, string]>;

export type DemoErrorCode = keyof typeof CATALOG;

/** A business failure, rendered as RFC 9457 problem+json like the API does. */
export class DemoError extends Error {
  constructor(
    readonly code: DemoErrorCode,
    detail: string = CATALOG[code][1],
    readonly extensions: Record<string, unknown> = {},
    readonly errors?: string[],
  ) {
    super(detail);
    this.name = 'DemoError';
  }

  get status(): number {
    return CATALOG[this.code][0];
  }

  toProblem(instance: string): Record<string, unknown> {
    return {
      type: `https://errors.wallet.dev/${this.code.toLowerCase().replace(/_/g, '-')}`,
      title: CATALOG[this.code][1],
      status: this.status,
      code: this.code,
      detail: this.message,
      instance,
      requestId: `demo-${Math.random().toString(36).slice(2, 10)}`,
      ...(this.errors ? { errors: this.errors } : {}),
      ...this.extensions,
    };
  }
}

export const validationError = (errors: string[]) =>
  new DemoError('VALIDATION_FAILED', 'The request body or parameters are invalid.', {}, errors);
