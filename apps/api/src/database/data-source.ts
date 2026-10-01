/**
 * DataSource used by the TypeORM CLI (migrations). The Nest app builds its own
 * connection in DatabaseModule from the same options.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DataSource } from 'typeorm';
import { validateEnv } from '../config/env.schema';
import { buildDataSourceOptions } from './typeorm.options';

for (const candidate of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
  if (existsSync(candidate)) {
    process.loadEnvFile(candidate);
    break;
  }
}

export default new DataSource(buildDataSourceOptions(validateEnv(process.env)));
