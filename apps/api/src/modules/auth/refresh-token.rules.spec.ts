import type { RefreshToken } from './entities/refresh-token.entity';
import { assessRefreshToken } from './refresh-token.rules';

const now = new Date('2026-10-01T12:00:00Z');

function token(overrides: Partial<RefreshToken> = {}): RefreshToken {
  return {
    id: 't1',
    userId: 'u1',
    familyId: 'f1',
    tokenHash: 'h'.repeat(64),
    expiresAt: new Date('2026-10-08T12:00:00Z'),
    revokedAt: null,
    replacedById: null,
    userAgent: null,
    ip: null,
    createdAt: new Date('2026-10-01T11:00:00Z'),
    ...overrides,
  };
}

describe('assessRefreshToken', () => {
  it('returns NOT_FOUND for unknown tokens', () => {
    expect(assessRefreshToken(null, now)).toEqual({ status: 'NOT_FOUND' });
  });

  it('accepts an active, unexpired token', () => {
    expect(assessRefreshToken(token(), now).status).toBe('VALID');
  });

  it('flags a revoked token as REUSED, even if it is also expired', () => {
    const revoked = token({ revokedAt: now, expiresAt: new Date('2026-09-01T00:00:00Z') });
    expect(assessRefreshToken(revoked, now).status).toBe('REUSED');
  });

  it('rejects an expired token', () => {
    expect(assessRefreshToken(token({ expiresAt: now }), now).status).toBe('EXPIRED');
  });
});
