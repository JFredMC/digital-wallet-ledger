import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsersAndRefreshTokens1790864538087 implements MigrationInterface {
  name = 'CreateUsersAndRefreshTokens1790864538087';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE users (
        id                    uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
        email                 citext       NOT NULL,
        password_hash         text         NOT NULL,
        full_name             varchar(120) NOT NULL,
        phone                 varchar(20),
        role                  varchar(20)  NOT NULL DEFAULT 'USER',
        status                varchar(20)  NOT NULL DEFAULT 'ACTIVE',
        failed_login_attempts int          NOT NULL DEFAULT 0,
        locked_until          timestamptz,
        created_at            timestamptz  NOT NULL DEFAULT now(),
        updated_at            timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT uq_users_email UNIQUE (email),
        CONSTRAINT uq_users_phone UNIQUE (phone),
        CONSTRAINT chk_users_role CHECK (role IN ('USER', 'ADMIN')),
        CONSTRAINT chk_users_status CHECK (status IN ('ACTIVE', 'LOCKED', 'DISABLED')),
        CONSTRAINT chk_users_failed_login_attempts CHECK (failed_login_attempts >= 0)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE refresh_tokens (
        id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id        uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        family_id      uuid        NOT NULL,
        token_hash     char(64)    NOT NULL,
        expires_at     timestamptz NOT NULL,
        revoked_at     timestamptz,
        replaced_by_id uuid        REFERENCES refresh_tokens (id) ON DELETE SET NULL,
        user_agent     text,
        ip             inet,
        created_at     timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_refresh_tokens_token_hash UNIQUE (token_hash)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX ix_refresh_tokens_user_active ON refresh_tokens (user_id) WHERE revoked_at IS NULL',
    );
    await queryRunner.query('CREATE INDEX ix_refresh_tokens_family ON refresh_tokens (family_id)');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE refresh_tokens');
    await queryRunner.query('DROP TABLE users');
  }
}
