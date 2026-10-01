import { durationToSeconds, validateDatabaseEnv, validateEnv } from './env.schema';

describe('validateEnv', () => {
  const base = {
    DATABASE_URL: 'postgres://wallet:wallet@localhost:5432/wallet',
    JWT_ACCESS_SECRET: 'x'.repeat(32),
  };

  it('applies defaults for optional variables', () => {
    const env = validateEnv(base);
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.DATABASE_SSL).toBe(false);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:4200']);
    expect(env.JWT_ACCESS_TTL).toBe(900);
    expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(7);
    expect(env.COOKIE_SECURE).toBe(true);
    expect(env.AUTH_MAX_FAILED_LOGINS).toBe(5);
    expect(env.DEMO_DEPOSITS_ENABLED).toBe(true);
    expect(env.DEMO_DEPOSIT_DAILY_LIMIT_MINOR).toBe(100_000_000);
    expect(env.MAX_TRANSFER_MINOR).toBe(500_000_000);
    expect(env.DAILY_TRANSFER_LIMIT_MINOR).toBe(2_000_000_000);
    expect(env.IDEMPOTENCY_KEY_TTL_HOURS).toBe(24);
  });

  it('rejects an out-of-range idempotency TTL', () => {
    expect(() => validateEnv({ ...base, IDEMPOTENCY_KEY_TTL_HOURS: '0' })).toThrow(
      /IDEMPOTENCY_KEY_TTL_HOURS/,
    );
  });

  it('parses and coerces provided values', () => {
    const env = validateEnv({
      ...base,
      PORT: '8080',
      DATABASE_SSL: 'true',
      CORS_ORIGINS: 'http://a.test, http://b.test',
      JWT_ACCESS_TTL: '1h',
      COOKIE_SECURE: 'false',
    });
    expect(env.PORT).toBe(8080);
    expect(env.DATABASE_SSL).toBe(true);
    expect(env.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
    expect(env.JWT_ACCESS_TTL).toBe(3600);
    expect(env.COOKIE_SECURE).toBe(false);
  });

  it('fails fast with a clear message when a required variable is missing', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL[\s\S]*JWT_ACCESS_SECRET/);
  });

  it('rejects a non-postgres DATABASE_URL', () => {
    expect(() => validateEnv({ ...base, DATABASE_URL: 'mysql://x' })).toThrow(/postgres/);
  });

  it('rejects a short JWT secret', () => {
    expect(() => validateEnv({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow(/at least 32/);
  });
});

describe('validateDatabaseEnv', () => {
  it('only requires database settings', () => {
    expect(validateDatabaseEnv({ DATABASE_URL: 'postgresql://u:p@h/db' })).toEqual({
      DATABASE_URL: 'postgresql://u:p@h/db',
      DATABASE_SSL: false,
      DATABASE_MIGRATIONS_RUN: false,
    });
  });
});

describe('durationToSeconds', () => {
  it.each([
    ['900', 900],
    ['30s', 30],
    ['15m', 900],
    ['2h', 7200],
    ['7d', 604800],
  ])('%s -> %i', (input, expected) => {
    expect(durationToSeconds(input)).toBe(expected);
  });

  it('throws on invalid input', () => {
    expect(() => durationToSeconds('15 minutes')).toThrow();
  });
});
