import { z } from 'zod';

const booleanFromString = (defaultValue: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(defaultValue)
    .transform((value) => value === 'true');

const DURATION_UNITS_IN_SECONDS = { s: 1, m: 60, h: 3600, d: 86400 } as const;

/** Parses "900", "30s", "15m", "1h" or "7d" into seconds. */
export function durationToSeconds(value: string): number {
  const match = /^(\d+)([smhd])?$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid duration "${value}"`);
  }
  const unit = (match[2] ?? 's') as keyof typeof DURATION_UNITS_IN_SECONDS;
  return Number(match[1]) * DURATION_UNITS_IN_SECONDS[unit];
}

const databaseSchema = z.object({
  DATABASE_URL: z
    .string({ error: 'DATABASE_URL is required' })
    .regex(/^postgres(ql)?:\/\//, 'DATABASE_URL must be a postgres:// connection string'),
  DATABASE_SSL: booleanFromString('false'),
  DATABASE_MIGRATIONS_RUN: booleanFromString('false'),
});

/**
 * Environment contract for the API. The app refuses to boot when the
 * environment does not satisfy this schema ("fail fast").
 */
export const envSchema = databaseSchema.extend({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:4200')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  TRUST_PROXY: booleanFromString('false'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  SWAGGER_ENABLED: booleanFromString('true'),

  // --- Auth ---
  JWT_ACCESS_SECRET: z
    .string({ error: 'JWT_ACCESS_SECRET is required' })
    .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  /** Access-token lifetime, exposed to the app in seconds. */
  JWT_ACCESS_TTL: z
    .string()
    .regex(/^\d+[smhd]?$/, 'JWT_ACCESS_TTL must look like 900, 30s, 15m, 1h or 1d')
    .default('15m')
    .transform(durationToSeconds),
  JWT_ISSUER: z.string().min(1).default('digital-wallet-ledger'),
  JWT_AUDIENCE: z.string().min(1).default('digital-wallet-ledger'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  COOKIE_SECURE: booleanFromString('true'),
  AUTH_MAX_FAILED_LOGINS: z.coerce.number().int().min(1).max(100).default(5),
  AUTH_LOCK_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),

  // --- Demo deposits (sandbox top-ups) ---
  DEMO_DEPOSITS_ENABLED: booleanFromString('true'),
  /** Max amount a user can top up in any rolling 24 h window, in minor units. */
  DEMO_DEPOSIT_DAILY_LIMIT_MINOR: z.coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .default(100_000_000),

  // --- Transfers ---
  /** Max amount of a single transfer, in minor units. */
  MAX_TRANSFER_MINOR: z.coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .default(500_000_000),
  /** Max total a wallet can send in any rolling 24 h window, in minor units. */
  DAILY_TRANSFER_LIMIT_MINOR: z.coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .default(2_000_000_000),

  // --- Idempotency ---
  /** How long a stored Idempotency-Key response can be replayed. */
  IDEMPOTENCY_KEY_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(24),
});

export type Env = z.infer<typeof envSchema>;
export type DatabaseEnv = z.infer<typeof databaseSchema>;

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
}

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${formatIssues(result.error)}`);
  }
  return result.data;
}

/** Subset used by the TypeORM CLI, which only needs database settings. */
export function validateDatabaseEnv(config: Record<string, unknown>): DatabaseEnv {
  const result = databaseSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid database configuration:\n${formatIssues(result.error)}`);
  }
  return result.data;
}
