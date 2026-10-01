import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P2P transfers (business view of a TRANSFER journal entry) and idempotency keys.
 */
export class CreateTransfersAndIdempotencyKeys1790866000000 implements MigrationInterface {
  name = 'CreateTransfersAndIdempotencyKeys1790866000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE transfers (
        id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
        journal_entry_id uuid         NOT NULL REFERENCES journal_entries (id),
        from_account_id  uuid         NOT NULL REFERENCES accounts (id),
        to_account_id    uuid         NOT NULL REFERENCES accounts (id),
        amount_minor     bigint       NOT NULL,
        currency         char(3)      NOT NULL,
        description      varchar(140),
        initiated_by     uuid         NOT NULL REFERENCES users (id),
        created_at       timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT uq_transfers_journal_entry UNIQUE (journal_entry_id),
        CONSTRAINT chk_transfers_distinct_accounts CHECK (from_account_id <> to_account_id),
        CONSTRAINT chk_transfers_amount_positive CHECK (amount_minor > 0)
      )
    `);
    // Rolling daily limit: Σ sent by an account in the last 24 h.
    await queryRunner.query(
      'CREATE INDEX ix_transfers_from_account_created ON transfers (from_account_id, created_at)',
    );
    await queryRunner.query('CREATE INDEX ix_transfers_to_account ON transfers (to_account_id)');
    // Transfers are part of the financial record: append-only like the ledger.
    await queryRunner.query(
      `CREATE TRIGGER trg_transfers_append_only BEFORE UPDATE OR DELETE ON transfers
       FOR EACH ROW EXECUTE FUNCTION ledger_forbid_mutation()`,
    );

    // The primary key is the "natural lock": a second request with the same key
    // blocks on the uncommitted insert of the first and then sees its outcome.
    await queryRunner.query(`
      CREATE TABLE idempotency_keys (
        user_id         uuid         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        key             varchar(255) NOT NULL,
        scope           varchar(100) NOT NULL,
        request_hash    char(64)     NOT NULL,
        response_status smallint,
        response_body   jsonb,
        created_at      timestamptz  NOT NULL DEFAULT now(),
        expires_at      timestamptz  NOT NULL,
        CONSTRAINT pk_idempotency_keys PRIMARY KEY (user_id, key)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX ix_idempotency_keys_expires_at ON idempotency_keys (expires_at)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE idempotency_keys');
    await queryRunner.query('DROP TABLE transfers');
  }
}
