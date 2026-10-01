import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { TrustedOriginGuard } from './trusted-origin.guard';

function contextWith(headers: Record<string, string>): ExecutionContext {
  const req = {
    protocol: 'https',
    header: (name: string) => headers[name.toLowerCase()],
    get: (name: string) => headers[name.toLowerCase()],
  };
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}

describe('TrustedOriginGuard', () => {
  const config = { get: () => ['http://localhost:4200'] } as unknown as ConfigService<never, true>;
  const guard = new TrustedOriginGuard(config);

  it('allows requests without an Origin header (non-browser clients)', () => {
    expect(guard.canActivate(contextWith({ host: 'api.test' }))).toBe(true);
  });

  it('allows configured origins and the API own origin', () => {
    expect(
      guard.canActivate(contextWith({ host: 'api.test', origin: 'http://localhost:4200' })),
    ).toBe(true);
    expect(guard.canActivate(contextWith({ host: 'api.test', origin: 'https://api.test' }))).toBe(
      true,
    );
  });

  it('rejects any other origin', () => {
    expect(() =>
      guard.canActivate(contextWith({ host: 'api.test', origin: 'https://evil.example' })),
    ).toThrow(expect.objectContaining({ code: 'UNTRUSTED_ORIGIN' }));
  });
});
