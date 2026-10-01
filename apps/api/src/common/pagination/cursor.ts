import { DomainError } from '../errors/domain-error';

/**
 * Keyset position in a list ordered by (created_at DESC, id DESC).
 * `createdAt` keeps PostgreSQL's microsecond precision (a JS Date would
 * truncate it to milliseconds and skip or repeat rows).
 */
export interface KeysetCursor {
  createdAt: string;
  id: string;
}

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const BIGINT_ID = /^\d{1,19}$/;

/** Opaque, URL-safe cursor. Clients must not build or parse it. */
export function encodeCursor(cursor: KeysetCursor): string {
  return Buffer.from(JSON.stringify([cursor.createdAt, cursor.id])).toString('base64url');
}

export function decodeCursor(value: string): KeysetCursor {
  try {
    const decoded: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (
      Array.isArray(decoded) &&
      decoded.length === 2 &&
      typeof decoded[0] === 'string' &&
      typeof decoded[1] === 'string' &&
      TIMESTAMP.test(decoded[0]) &&
      BIGINT_ID.test(decoded[1])
    ) {
      return { createdAt: decoded[0], id: decoded[1] };
    }
  } catch {
    // fall through
  }
  throw new DomainError('INVALID_CURSOR', 'The pagination cursor is malformed.');
}
