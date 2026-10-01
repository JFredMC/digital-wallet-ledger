import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DataSource, EntityManager } from 'typeorm';
import { DomainError } from '../../common/errors/domain-error';
import type { RefreshToken } from './entities/refresh-token.entity';
import { hashToken, TokenService } from './token.service';

const meta = { userAgent: 'jest', ip: '127.0.0.1' };

function storedToken(overrides: Partial<RefreshToken> = {}): RefreshToken {
  return {
    id: 'old-id',
    userId: 'user-1',
    familyId: 'family-1',
    tokenHash: hashToken('raw-token'),
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    replacedById: null,
    userAgent: null,
    ip: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function setup(found: RefreshToken | null) {
  const manager = {
    findOne: jest.fn().mockResolvedValue(found),
    update: jest.fn().mockResolvedValue(undefined),
    create: jest.fn((_entity: unknown, data: Partial<RefreshToken>) => data),
    save: jest.fn((data: Partial<RefreshToken>) => Promise.resolve({ ...data, id: 'new-id' })),
  };
  const dataSource = {
    manager,
    transaction: jest.fn((work: (m: EntityManager) => Promise<unknown>) =>
      work(manager as unknown as EntityManager),
    ),
  } as unknown as DataSource;
  const config = {
    get: jest.fn((key: string) => ({ JWT_ACCESS_TTL: 900, REFRESH_TOKEN_TTL_DAYS: 7 })[key]),
  } as unknown as ConfigService;
  const jwt = { signAsync: jest.fn().mockResolvedValue('signed.jwt') } as unknown as JwtService;
  return { service: new TokenService(jwt, dataSource, config as never), manager };
}

describe('TokenService', () => {
  it('signs an access token with subject and role', async () => {
    const { service } = setup(null);
    await expect(service.signAccessToken({ id: 'user-1', role: 'USER' })).resolves.toEqual({
      accessToken: 'signed.jwt',
      expiresIn: 900,
    });
  });

  it('issues refresh tokens that are stored only as a SHA-256 hash', async () => {
    const { service, manager } = setup(null);
    const issued = await service.issueRefreshToken('user-1', meta);

    const persisted = manager.save.mock.calls[0][0];
    expect(issued.value).toMatch(/^[\w-]{43}$/);
    expect(persisted.tokenHash).toBe(hashToken(issued.value));
    expect(persisted.tokenHash).not.toBe(issued.value);
    expect(persisted.familyId).toEqual(expect.any(String));
    expect(issued.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 3600 * 1000);
  });

  describe('rotateRefreshToken', () => {
    it('rotates a valid token within the same family and revokes the old one', async () => {
      const { service, manager } = setup(storedToken());
      const result = await service.rotateRefreshToken('raw-token', meta);

      expect(manager.findOne).toHaveBeenCalledWith(expect.anything(), {
        where: { tokenHash: hashToken('raw-token') },
        lock: { mode: 'pessimistic_write' },
      });
      expect(result.userId).toBe('user-1');
      expect(manager.save.mock.calls[0][0]).toMatchObject({
        familyId: 'family-1',
        userId: 'user-1',
      });
      expect(manager.update).toHaveBeenCalledWith(
        expect.anything(),
        { id: 'old-id' },
        { revokedAt: expect.any(Date), replacedById: 'new-id' },
      );
    });

    it('revokes the whole family when a rotated token is reused', async () => {
      const { service, manager } = setup(storedToken({ revokedAt: new Date() }));

      await expect(service.rotateRefreshToken('raw-token', meta)).rejects.toMatchObject({
        code: 'REFRESH_TOKEN_REUSED',
      });
      expect(manager.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ familyId: 'family-1' }),
        { revokedAt: expect.any(Date) },
      );
      expect(manager.save).not.toHaveBeenCalled();
    });

    it.each([
      ['unknown', null],
      ['expired', storedToken({ expiresAt: new Date(Date.now() - 1000) })],
    ])('rejects an %s token without issuing a new one', async (_label, found) => {
      const { service, manager } = setup(found);

      const error = await service.rotateRefreshToken('raw-token', meta).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(DomainError);
      expect(error).toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
      expect(manager.save).not.toHaveBeenCalled();
    });
  });
});
