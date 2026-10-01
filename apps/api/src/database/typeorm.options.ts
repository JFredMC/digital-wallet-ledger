import { join } from 'node:path';
import type { DataSourceOptions } from 'typeorm';
import type { Env } from '../config/env.schema';

// Load .ts files when running through ts-node/ts-jest and .js from the compiled build
// (never *.d.ts, which would otherwise match a "*.{ts,js}" glob).
const ext = __filename.endsWith('.ts') ? 'ts' : 'js';

export function buildDataSourceOptions(
  env: Pick<Env, 'DATABASE_URL' | 'DATABASE_SSL' | 'DATABASE_MIGRATIONS_RUN'>,
): DataSourceOptions {
  return {
    type: 'postgres',
    url: env.DATABASE_URL,
    ssl: env.DATABASE_SSL ? { rejectUnauthorized: true } : false,
    entities: [join(__dirname, '..', '**', `*.entity.${ext}`)],
    migrations: [join(__dirname, 'migrations', `*.${ext}`)],
    migrationsTableName: 'typeorm_migrations',
    migrationsRun: env.DATABASE_MIGRATIONS_RUN,
    // Schema changes always go through versioned migrations.
    synchronize: false,
  };
}
