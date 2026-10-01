import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;

  it('lets @Public() routes through without checking the token', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(true) };
    const guard = new JwtAuthGuard(reflector as unknown as Reflector);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('delegates to the passport JWT strategy for protected routes', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    const guard = new JwtAuthGuard(reflector as unknown as Reflector);
    const parent = jest
      .spyOn(AuthGuard('jwt').prototype as { canActivate: () => boolean }, 'canActivate')
      .mockReturnValue(false);

    expect(guard.canActivate(context)).toBe(false);
    expect(parent).toHaveBeenCalled();
  });
});
