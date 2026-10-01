import type { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  it('maps the verified payload to the request user', () => {
    const config = {
      get: (key: string) =>
        ({
          JWT_ACCESS_SECRET: 's'.repeat(32),
          JWT_ISSUER: 'iss',
          JWT_AUDIENCE: 'aud',
        })[key],
    } as unknown as ConfigService<never, true>;
    const strategy = new JwtStrategy(config);
    expect(strategy.validate({ sub: 'user-1', role: 'ADMIN' })).toEqual({
      id: 'user-1',
      role: 'ADMIN',
    });
  });
});
