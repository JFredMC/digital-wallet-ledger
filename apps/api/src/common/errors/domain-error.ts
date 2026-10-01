import { ERROR_CATALOG, type ErrorCode } from './error-codes';

/**
 * Expected, business-level failure. Rendered as RFC 9457 problem details by
 * ProblemDetailsFilter using the status/title from ERROR_CATALOG.
 */
export class DomainError extends Error {
  readonly status: number;
  readonly title: string;

  constructor(
    readonly code: ErrorCode,
    detail?: string,
    readonly extensions: Record<string, unknown> = {},
  ) {
    super(detail ?? ERROR_CATALOG[code].title);
    this.name = 'DomainError';
    this.status = ERROR_CATALOG[code].status;
    this.title = ERROR_CATALOG[code].title;
  }
}
