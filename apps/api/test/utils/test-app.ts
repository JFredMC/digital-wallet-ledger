import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';

export interface TestContext {
  app: INestApplication<App>;
  dataSource: DataSource;
}

/** Boots the real AppModule (real Postgres, migrations applied) with production HTTP setup. */
export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>({ logger: ['error'] });
  configureApp(app);
  await app.init();
  return { app, dataSource: app.get(DataSource) };
}

/** Empties every application table (keeps the migrations table). */
export async function resetDatabase(dataSource: DataSource): Promise<void> {
  const rows: { tablename: string }[] = await dataSource.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'typeorm_migrations'`,
  );
  if (rows.length === 0) return;
  const tables = rows.map(({ tablename }) => `"${tablename}"`).join(', ');
  await dataSource.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
}
