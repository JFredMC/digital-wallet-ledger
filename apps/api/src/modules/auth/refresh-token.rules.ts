import type { RefreshToken } from './entities/refresh-token.entity';

export type RefreshTokenAssessment =
  | { status: 'VALID'; token: RefreshToken }
  /** Already rotated or revoked: presenting it again signals possible theft. */
  | { status: 'REUSED'; token: RefreshToken }
  | { status: 'EXPIRED'; token: RefreshToken }
  | { status: 'NOT_FOUND' };

/** Pure decision about a presented refresh token (no I/O, easy to unit test). */
export function assessRefreshToken(token: RefreshToken | null, now: Date): RefreshTokenAssessment {
  if (!token) return { status: 'NOT_FOUND' };
  if (token.revokedAt) return { status: 'REUSED', token };
  if (token.expiresAt.getTime() <= now.getTime()) return { status: 'EXPIRED', token };
  return { status: 'VALID', token };
}
