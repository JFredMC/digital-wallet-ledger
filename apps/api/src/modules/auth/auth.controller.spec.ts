import type { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { DomainError } from '../../common/errors/domain-error';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';

const expiresAt = new Date('2026-10-08T00:00:00Z');
const body = {
  accessToken: 'jwt',
  tokenType: 'Bearer' as const,
  expiresIn: 900,
  user: { id: 'u1', email: 'a@b.co', fullName: 'Ana', role: 'USER' as const, createdAt: 'x' },
};
const cookieOptions = { httpOnly: true, secure: true, sameSite: 'strict', path: '/api/v1/auth' };

function setup() {
  const auth = {
    register: jest.fn().mockResolvedValue({ body, refreshToken: { value: 'rt-1', expiresAt } }),
    login: jest.fn().mockResolvedValue({ body, refreshToken: { value: 'rt-1', expiresAt } }),
    refresh: jest.fn().mockResolvedValue({ body, refreshToken: { value: 'rt-2', expiresAt } }),
    logout: jest.fn().mockResolvedValue(undefined),
    me: jest.fn().mockResolvedValue(body.user),
  };
  const config = { get: jest.fn().mockReturnValue(true) };
  const controller = new AuthController(
    auth as unknown as AuthService,
    config as unknown as ConfigService<never, true>,
  );
  const res = { cookie: jest.fn(), clearCookie: jest.fn() };
  const req = (cookies: Record<string, string> = {}) =>
    ({
      cookies,
      ip: '127.0.0.1',
      header: (name: string) => (name === 'user-agent' ? 'jest' : undefined),
    }) as unknown as Request;
  return { controller, auth, res, resp: res as unknown as Response, req };
}

describe('AuthController', () => {
  it('register sets the refresh cookie and returns the body', async () => {
    const { controller, auth, res, resp, req } = setup();
    const dto = { email: 'a@b.co', password: 'S3cure-passw0rd', fullName: 'Ana' };

    await expect(controller.register(dto, req(), resp)).resolves.toBe(body);
    expect(auth.register).toHaveBeenCalledWith(dto, { userAgent: 'jest', ip: '127.0.0.1' });
    expect(res.cookie).toHaveBeenCalledWith('refresh_token', 'rt-1', {
      ...cookieOptions,
      expires: expiresAt,
    });
  });

  it('login sets the refresh cookie', async () => {
    const { controller, res, resp, req } = setup();
    await controller.login({ email: 'a@b.co', password: 'x' }, req(), resp);
    expect(res.cookie).toHaveBeenCalledWith('refresh_token', 'rt-1', expect.any(Object));
  });

  it('refresh rotates the cookie', async () => {
    const { controller, auth, res, resp, req } = setup();
    await expect(controller.refresh(req({ refresh_token: 'rt-1' }), resp)).resolves.toBe(body);
    expect(auth.refresh).toHaveBeenCalledWith('rt-1', expect.any(Object));
    expect(res.cookie).toHaveBeenCalledWith('refresh_token', 'rt-2', expect.any(Object));
  });

  it('refresh without a cookie fails with INVALID_REFRESH_TOKEN', async () => {
    const { controller, auth, resp, req } = setup();
    await expect(controller.refresh(req(), resp)).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
    expect(auth.refresh).not.toHaveBeenCalled();
  });

  it('refresh clears the cookie when rotation fails', async () => {
    const { controller, auth, res, resp, req } = setup();
    auth.refresh.mockRejectedValue(new DomainError('REFRESH_TOKEN_REUSED'));

    await expect(controller.refresh(req({ refresh_token: 'old' }), resp)).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_REUSED',
    });
    expect(res.clearCookie).toHaveBeenCalledWith('refresh_token', cookieOptions);
  });

  it('logout revokes the token (if any) and clears the cookie', async () => {
    const { controller, auth, res, resp, req } = setup();
    await controller.logout(req({ refresh_token: 'rt-1' }), resp);
    expect(auth.logout).toHaveBeenCalledWith('rt-1');
    expect(res.clearCookie).toHaveBeenCalled();

    auth.logout.mockClear();
    await controller.logout(req(), resp);
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it('me returns the current user profile', async () => {
    const { controller, auth } = setup();
    await expect(controller.me({ id: 'u1', role: 'USER' })).resolves.toBe(body.user);
    expect(auth.me).toHaveBeenCalledWith('u1');
  });
});
