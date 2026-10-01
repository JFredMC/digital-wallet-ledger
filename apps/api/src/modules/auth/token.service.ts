import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { DomainError } from '../../common/errors/domain-error';
import type { Env } from '../../config/env.schema';
import type { User, UserRole } from '../users/entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { assessRefreshToken } from './refresh-token.rules';

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
}

export interface ClientMeta {
  userAgent: string | null;
  ip: string | null;
}

export interface IssuedAccessToken {
  accessToken: string;
  expiresIn: number;
}

export interface IssuedRefreshToken {
  /** Raw opaque value: goes to the client cookie, never stored. */
  value: string;
  expiresAt: Date;
}

export interface RotatedRefreshToken {
  userId: string;
  refreshToken: IssuedRefreshToken;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export const hashToken = (raw: string): string => createHash('sha256').update(raw).digest('hex');

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async signAccessToken(user: Pick<User, 'id' | 'role'>): Promise<IssuedAccessToken> {
    const payload: AccessTokenPayload = { sub: user.id, role: user.role };
    return {
      accessToken: await this.jwt.signAsync(payload),
      expiresIn: this.config.get('JWT_ACCESS_TTL', { infer: true }),
    };
  }

  /** Starts a new token family (a new login session). */
  issueRefreshToken(userId: string, meta: ClientMeta): Promise<IssuedRefreshToken> {
    return this.persist(this.dataSource.manager, userId, randomUUID(), meta).then(
      ({ issued }) => issued,
    );
  }

  /**
   * Single-use rotation. Inside one transaction the presented token row is
   * locked (FOR UPDATE), so concurrent refreshes with the same token are
   * serialized: the first wins, the second is treated as reuse.
   * Reuse of an already-rotated token revokes the whole family.
   */
  async rotateRefreshToken(raw: string, meta: ClientMeta): Promise<RotatedRefreshToken> {
    const outcome = await this.dataSource.transaction(async (manager) => {
      const current = await manager.findOne(RefreshToken, {
        where: { tokenHash: hashToken(raw) },
        lock: { mode: 'pessimistic_write' },
      });
      const assessment = assessRefreshToken(current, new Date());

      switch (assessment.status) {
        case 'REUSED':
          await manager.update(
            RefreshToken,
            { familyId: assessment.token.familyId, revokedAt: IsNull() },
            { revokedAt: new Date() },
          );
          return { status: 'REUSED', userId: assessment.token.userId } as const;
        case 'VALID': {
          const { token } = assessment;
          const next = await this.persist(manager, token.userId, token.familyId, meta);
          await manager.update(
            RefreshToken,
            { id: token.id },
            { revokedAt: new Date(), replacedById: next.id },
          );
          return { status: 'VALID', userId: token.userId, refreshToken: next.issued } as const;
        }
        default:
          return { status: assessment.status } as const;
      }
    });

    if (outcome.status === 'REUSED') {
      this.logger.warn(
        `Refresh token reuse detected; token family revoked (user ${outcome.userId})`,
      );
      throw new DomainError(
        'REFRESH_TOKEN_REUSED',
        'This session was closed for security reasons. Please log in again.',
      );
    }
    if (outcome.status !== 'VALID') {
      throw new DomainError('INVALID_REFRESH_TOKEN', 'The session is invalid or has expired.');
    }
    return { userId: outcome.userId, refreshToken: outcome.refreshToken };
  }

  /** Revokes the presented token (logout). Unknown/already revoked tokens are ignored. */
  async revokeRefreshToken(raw: string): Promise<void> {
    await this.dataSource.manager.update(
      RefreshToken,
      { tokenHash: hashToken(raw), revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  /** Revokes every token in a family (e.g. the user no longer exists or is disabled). */
  async revokeFamilyOf(raw: string): Promise<void> {
    const token = await this.dataSource.manager.findOneBy(RefreshToken, {
      tokenHash: hashToken(raw),
    });
    if (token) {
      await this.dataSource.manager.update(
        RefreshToken,
        { familyId: token.familyId, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
    }
  }

  private async persist(
    manager: EntityManager,
    userId: string,
    familyId: string,
    meta: ClientMeta,
  ): Promise<{ id: string; issued: IssuedRefreshToken }> {
    const value = randomBytes(32).toString('base64url');
    const ttlDays = this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });
    const expiresAt = new Date(Date.now() + ttlDays * DAY_MS);

    const saved = await manager.save(
      manager.create(RefreshToken, {
        userId,
        familyId,
        tokenHash: hashToken(value),
        expiresAt,
        userAgent: meta.userAgent?.slice(0, 512) ?? null,
        ip: meta.ip,
      }),
    );
    return { id: saved.id, issued: { value, expiresAt } };
  }
}
