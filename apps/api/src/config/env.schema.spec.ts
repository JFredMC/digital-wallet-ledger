import { validateEnv } from './env.schema';

describe('validateEnv', () => {
  const base = { DATABASE_URL: 'postgres://wallet:wallet@localhost:5432/wallet' };

  it('applies defaults for optional variables', () => {
    const env = validateEnv(base);
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.DATABASE_SSL).toBe(false);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:4200']);
  });

  it('parses and coerces provided values', () => {
    const env = validateEnv({
      ...base,
      PORT: '8080',
      DATABASE_SSL: 'true',
      CORS_ORIGINS: 'http://a.test, http://b.test',
    });
    expect(env.PORT).toBe(8080);
    expect(env.DATABASE_SSL).toBe(true);
    expect(env.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
  });

  it('fails fast with a clear message when a required variable is missing', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });

  it('rejects a non-postgres DATABASE_URL', () => {
    expect(() => validateEnv({ DATABASE_URL: 'mysql://x' })).toThrow(/postgres/);
  });
});
