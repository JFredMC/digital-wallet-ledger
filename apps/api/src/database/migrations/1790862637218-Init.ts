import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stage 0 baseline migration: enables the extensions the schema will rely on.
 * Both are "trusted" extensions (PostgreSQL 13+), so the database owner can create them.
 */
export class Init1790862637218 implements MigrationInterface {
  name = 'Init1790862637218';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "citext"');
  }

  public async down(): Promise<void> {
    // Extensions are intentionally left in place: other objects may depend on them.
  }
}
