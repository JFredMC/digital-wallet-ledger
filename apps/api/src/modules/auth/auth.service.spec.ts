import { ConfigService } from '@nestjs/config';
import { DomainError } from '../../common/errors/domain-error';
import type { User } from '../users/entities/user.entity';
import type { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import type { TokenService } from './token.service';

const meta = { userAgent: 'jest', ip: '127.0.0.1' };
const refreshToken = { value: 'raw-refresh', expiresAt: new Date('2026-10-08T00:00:00Z') };

function user(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'ana@example.com',
    passwordHash: '$argon2id$hash',
    fullName: 'Ana Gómez',
    phone: null,
    role: 'USER',
    status: 'ACTIVE',
    failedLoginAttempts: 0,
    lockedUntil: null,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-01T00:00:00Z'),
    ...overrides,
  };
}

function setup() {
  const users = {
    create: jest.fn(),
    findById: jest.fn(),
    findByEmailWithPassword: jest.fn(),
    registerFailedLogin: jest.fn(),
    resetFailedLogins: jest.fn(),
  };
  const passwords = {
    hash: jest.fn().mockResolvedValue('$argon2id$hash'),
    verify: jest.fn(),
    verifyAgainstDummy: jest.fn().mockResolvedValue(undefined),
  };
  const tokens = {
    signAccessToken: jest.fn().mockResolvedValue({ accessToken: 'jwt', expiresIn: 900 }),
    issueRefreshToken: jest.fn().mockResolvedValue(refreshToken),
    rotateRefreshToken: jest.fn(),
    revokeRefreshToken: jest.fn(),
    revokeFamilyOf: jest.fn(),
  };
  const config = {
    get: jest.fn((key: string) => ({ AUTH_MAX_FAILED_LOGINS: 5, AUTH_LOCK_MINUTES: 15 })[key]),
  };
  const service = new AuthService(
    users as unknown as UsersService,
    passwords,
    tokens as unknown as TokenService,
    config as unknown as ConfigService<never, true>,
  );
  return { service, users, passwords, tokens };
}

const expectInvalidCredentials = (promise: Promise<unknown>) =>
  expect(promise).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });

describe('AuthService', () => {
  describe('register', () => {
    it('stores only the password hash and starts a session', async () => {
      const { service, users, passwords, tokens } = setup();
      users.create.mockResolvedValue(user());

      const result = await service.register(
        { email: 'ana@example.com', password: 'S3cure-passw0rd', fullName: 'Ana Gómez' },
        meta,
      );

      expect(passwords.hash).toHaveBeenCalledWith('S3cure-passw0rd');
      expect(users.create).toHaveBeenCalledWith({
        email: 'ana@example.com',
        fullName: 'Ana Gómez',
        passwordHash: '$argon2id$hash',
      });
      expect(tokens.issueRefreshToken).toHaveBeenCalledWith('user-1', meta);
      expect(result.refreshToken).toBe(refreshToken);
      expect(result.body).toEqual({
        accessToken: 'jwt',
        tokenType: 'Bearer',
        expiresIn: 900,
        user: {
          id: 'user-1',
          email: 'ana@example.com',
          fullName: 'Ana Gómez',
          role: 'USER',
          createdAt: '2026-10-01T00:00:00.000Z',
        },
      });
      expect(JSON.stringify(result.body)).not.toContain('argon2');
    });

    it('propagates duplicate-email errors', async () => {
      const { service, users } = setup();
      users.create.mockRejectedValue(new DomainError('EMAIL_ALREADY_REGISTERED'));

      await expect(
        service.register({ email: 'a@b.co', password: 'x1234567', fullName: 'Ana' }, meta),
      ).rejects.toMatchObject({ code: 'EMAIL_ALREADY_REGISTERED' });
    });
  });

  describe('login', () => {
    const credentials = { email: 'ana@example.com', password: 'S3cure-passw0rd' };

    it('starts a session with valid credentials', async () => {
      const { service, users, passwords, tokens } = setup();
      users.findByEmailWithPassword.mockResolvedValue(user());
      passwords.verify.mockResolvedValue(true);

      const result = await service.login(credentials, meta);

      expect(result.body.accessToken).toBe('jwt');
      expect(tokens.issueRefreshToken).toHaveBeenCalled();
      expect(users.resetFailedLogins).not.toHaveBeenCalled();
    });

    it('resets the failure counter after a successful login', async () => {
      const { service, users, passwords } = setup();
      users.findByEmailWithPassword.mockResolvedValue(user({ failedLoginAttempts: 3 }));
      passwords.verify.mockResolvedValue(true);

      await service.login(credentials, meta);
      expect(users.resetFailedLogins).toHaveBeenCalledWith('user-1');
    });

    it('counts a failed attempt on a wrong password', async () => {
      const { service, users, passwords, tokens } = setup();
      users.findByEmailWithPassword.mockResolvedValue(user());
      passwords.verify.mockResolvedValue(false);

      await expectInvalidCredentials(service.login(credentials, meta));
      expect(users.registerFailedLogin).toHaveBeenCalledWith('user-1', 5, 15);
      expect(tokens.issueRefreshToken).not.toHaveBeenCalled();
    });

    it('fails generically and still burns hashing time for unknown emails', async () => {
      const { service, users, passwords } = setup();
      users.findByEmailWithPassword.mockResolvedValue(null);

      await expectInvalidCredentials(service.login(credentials, meta));
      expect(passwords.verifyAgainstDummy).toHaveBeenCalledWith(credentials.password);
      expect(users.registerFailedLogin).not.toHaveBeenCalled();
    });

    it('rejects a temporarily locked user even with the right password', async () => {
      const { service, users, passwords } = setup();
      users.findByEmailWithPassword.mockResolvedValue(
        user({ lockedUntil: new Date(Date.now() + 60_000) }),
      );
      passwords.verify.mockResolvedValue(true);

      await expectInvalidCredentials(service.login(credentials, meta));
      expect(passwords.verify).not.toHaveBeenCalled();
      expect(passwords.verifyAgainstDummy).toHaveBeenCalled();
    });

    it('lets the user in again once the lock has expired', async () => {
      const { service, users, passwords } = setup();
      users.findByEmailWithPassword.mockResolvedValue(
        user({ lockedUntil: new Date(Date.now() - 1000) }),
      );
      passwords.verify.mockResolvedValue(true);

      await expect(service.login(credentials, meta)).resolves.toBeDefined();
      expect(users.resetFailedLogins).toHaveBeenCalledWith('user-1');
    });

    it('rejects disabled users', async () => {
      const { service, users } = setup();
      users.findByEmailWithPassword.mockResolvedValue(user({ status: 'DISABLED' }));
      await expectInvalidCredentials(service.login(credentials, meta));
    });
  });

  describe('refresh', () => {
    it('returns a new access token for the rotated session', async () => {
      const { service, users, tokens } = setup();
      tokens.rotateRefreshToken.mockResolvedValue({ userId: 'user-1', refreshToken });
      users.findById.mockResolvedValue(user());

      const result = await service.refresh('old-raw', meta);
      expect(tokens.rotateRefreshToken).toHaveBeenCalledWith('old-raw', meta);
      expect(result.body.accessToken).toBe('jwt');
      expect(result.refreshToken).toBe(refreshToken);
    });

    it('revokes the session if the user is no longer active', async () => {
      const { service, users, tokens } = setup();
      tokens.rotateRefreshToken.mockResolvedValue({ userId: 'user-1', refreshToken });
      users.findById.mockResolvedValue(user({ status: 'DISABLED' }));

      await expect(service.refresh('old-raw', meta)).rejects.toMatchObject({
        code: 'INVALID_REFRESH_TOKEN',
      });
      expect(tokens.revokeFamilyOf).toHaveBeenCalledWith(refreshToken.value);
    });
  });

  it('logout revokes the presented refresh token', async () => {
    const { service, tokens } = setup();
    await service.logout('raw');
    expect(tokens.revokeRefreshToken).toHaveBeenCalledWith('raw');
  });

  it('me returns 401 when the user disappeared', async () => {
    const { service, users } = setup();
    users.findById.mockResolvedValue(null);
    await expect(service.me('ghost')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
