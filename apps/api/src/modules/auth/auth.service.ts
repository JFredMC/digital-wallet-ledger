import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainError } from '../../common/errors/domain-error';
import type { Env } from '../../config/env.schema';
import { UserDto } from '../users/dto/user.dto';
import type { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import type { AuthResponseDto } from './dto/auth-response.dto';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import { PasswordService } from './password.service';
import { ClientMeta, IssuedRefreshToken, TokenService } from './token.service';

export interface AuthResult {
  body: AuthResponseDto;
  refreshToken: IssuedRefreshToken;
}

const INVALID_CREDENTIALS_DETAIL = 'Email or password is incorrect.';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async register(dto: RegisterDto, meta: ClientMeta): Promise<AuthResult> {
    const passwordHash = await this.passwords.hash(dto.password);
    const user = await this.users.create({
      email: dto.email,
      fullName: dto.fullName,
      passwordHash,
    });
    return this.startSession(user, meta);
  }

  /**
   * Generic failure for every case (unknown email, wrong password, locked or
   * disabled user) and comparable timing, so the endpoint does not reveal
   * which emails are registered.
   */
  async login(dto: LoginDto, meta: ClientMeta): Promise<AuthResult> {
    const user = await this.users.findByEmailWithPassword(dto.email);
    const isLocked = !!user?.lockedUntil && user.lockedUntil.getTime() > Date.now();

    if (!user || user.status !== 'ACTIVE' || isLocked) {
      await this.passwords.verifyAgainstDummy(dto.password);
      throw new DomainError('INVALID_CREDENTIALS', INVALID_CREDENTIALS_DETAIL);
    }

    if (!(await this.passwords.verify(user.passwordHash, dto.password))) {
      await this.users.registerFailedLogin(
        user.id,
        this.config.get('AUTH_MAX_FAILED_LOGINS', { infer: true }),
        this.config.get('AUTH_LOCK_MINUTES', { infer: true }),
      );
      throw new DomainError('INVALID_CREDENTIALS', INVALID_CREDENTIALS_DETAIL);
    }

    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.users.resetFailedLogins(user.id);
    }
    return this.startSession(user, meta);
  }

  async refresh(rawRefreshToken: string, meta: ClientMeta): Promise<AuthResult> {
    const { userId, refreshToken } = await this.tokens.rotateRefreshToken(rawRefreshToken, meta);
    const user = await this.users.findById(userId);
    if (!user || user.status !== 'ACTIVE') {
      await this.tokens.revokeFamilyOf(refreshToken.value);
      throw new DomainError('INVALID_REFRESH_TOKEN', 'The session is invalid or has expired.');
    }
    return { body: await this.buildBody(user), refreshToken };
  }

  logout(rawRefreshToken: string): Promise<void> {
    return this.tokens.revokeRefreshToken(rawRefreshToken);
  }

  async me(userId: string): Promise<UserDto> {
    const user = await this.users.findById(userId);
    if (!user) throw new DomainError('UNAUTHORIZED', 'User no longer exists.');
    return UserDto.fromEntity(user);
  }

  private async startSession(user: User, meta: ClientMeta): Promise<AuthResult> {
    const refreshToken = await this.tokens.issueRefreshToken(user.id, meta);
    return { body: await this.buildBody(user), refreshToken };
  }

  private async buildBody(user: User): Promise<AuthResponseDto> {
    const { accessToken, expiresIn } = await this.tokens.signAccessToken(user);
    return { accessToken, tokenType: 'Bearer', expiresIn, user: UserDto.fromEntity(user) };
  }
}
