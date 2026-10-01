import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Accounts + double-entry ledger.
 *
 * Accounting convention (all accounts): balance = Σ CREDIT − Σ DEBIT.
 * SYSTEM_FUNDING goes negative as demo money enters the system, so the sum of
 * every balance is always 0.
 */
export class CreateAccountsAndLedger1790865146299 implements MigrationInterface {
  name = 'CreateAccountsAndLedger1790865146299';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Human-readable account numbers: 1000-0000-0001, 1000-0000-0002, ...
    await queryRunner.query('CREATE SEQUENCE account_number_seq START 1');
    await queryRunner.query(`
      CREATE FUNCTION next_account_number() RETURNS varchar
      LANGUAGE plpgsql VOLATILE AS $$
      DECLARE
        n bigint := nextval('account_number_seq');
      BEGIN
        RETURN '1000-' || to_char(n / 10000, 'FM0000') || '-' || to_char(n % 10000, 'FM0000');
      END
      $$
    `);

    await queryRunner.query(`
      CREATE TABLE accounts (
        id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id       uuid        REFERENCES users (id) ON DELETE RESTRICT,
        number        varchar(20) NOT NULL DEFAULT next_account_number(),
        alias         varchar(50),
        type          varchar(20) NOT NULL,
        currency      char(3)     NOT NULL DEFAULT 'COP',
        balance_minor bigint      NOT NULL DEFAULT 0,
        status        varchar(20) NOT NULL DEFAULT 'ACTIVE',
        version       int         NOT NULL DEFAULT 0,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_accounts_number UNIQUE (number),
        CONSTRAINT uq_accounts_alias UNIQUE (alias),
        -- Target of the (account_id, currency) FK from ledger_entries.
        CONSTRAINT uq_accounts_id_currency UNIQUE (id, currency),
        CONSTRAINT chk_accounts_type CHECK (type IN ('USER_WALLET', 'SYSTEM_FUNDING', 'SYSTEM_FEES')),
        CONSTRAINT chk_accounts_status CHECK (status IN ('ACTIVE', 'FROZEN', 'CLOSED')),
        CONSTRAINT chk_accounts_currency CHECK (currency ~ '^[A-Z]{3}$'),
        -- Last line of defence: a user wallet can never be overdrawn, even if the code fails.
        CONSTRAINT chk_wallet_non_negative CHECK (type <> 'USER_WALLET' OR balance_minor >= 0),
        CONSTRAINT chk_wallet_has_owner CHECK ((type = 'USER_WALLET') = (user_id IS NOT NULL))
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX ux_accounts_user_currency ON accounts (user_id, currency) WHERE type = 'USER_WALLET'`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX ux_accounts_system_type_currency ON accounts (type, currency) WHERE type <> 'USER_WALLET'`,
    );
    await queryRunner.query('CREATE INDEX ix_accounts_user ON accounts (user_id)');

    await queryRunner.query(`
      INSERT INTO accounts (number, type, currency) VALUES
        ('9000-0000-0001', 'SYSTEM_FUNDING', 'COP'),
        ('9000-0000-0002', 'SYSTEM_FEES', 'COP')
    `);

    await queryRunner.query(`
      CREATE TABLE journal_entries (
        id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
        type        varchar(20)  NOT NULL,
        description varchar(140),
        created_at  timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT chk_journal_entries_type CHECK (type IN ('TRANSFER', 'DEPOSIT', 'FEE', 'REVERSAL'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE ledger_entries (
        id                  bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        journal_entry_id    uuid        NOT NULL REFERENCES journal_entries (id),
        account_id          uuid        NOT NULL,
        direction           varchar(6)  NOT NULL,
        amount_minor        bigint      NOT NULL,
        currency            char(3)     NOT NULL,
        balance_after_minor bigint      NOT NULL,
        created_at          timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_ledger_entries_direction CHECK (direction IN ('DEBIT', 'CREDIT')),
        CONSTRAINT chk_ledger_entries_amount_positive CHECK (amount_minor > 0),
        -- A line can only be posted in its account's currency.
        CONSTRAINT fk_ledger_entries_account_currency FOREIGN KEY (account_id, currency)
          REFERENCES accounts (id, currency),
        CONSTRAINT uq_ledger_entries_journal_account UNIQUE (journal_entry_id, account_id)
      )
    `);
    // Keyset pagination for account history (newest first).
    await queryRunner.query(
      'CREATE INDEX ix_ledger_entries_account_history ON ledger_entries (account_id, created_at DESC, id DESC)',
    );

    // Append-only: history is corrected with compensating entries, never edited.
    await queryRunner.query(`
      CREATE FUNCTION ledger_forbid_mutation() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'ledger is append-only: % on % is not allowed', TG_OP, TG_TABLE_NAME
          USING ERRCODE = 'restrict_violation';
      END
      $$
    `);
    for (const table of ['journal_entries', 'ledger_entries']) {
      await queryRunner.query(
        `CREATE TRIGGER trg_${table}_append_only BEFORE UPDATE OR DELETE ON ${table}
         FOR EACH ROW EXECUTE FUNCTION ledger_forbid_mutation()`,
      );
    }

    // At COMMIT, every journal touched by the transaction must balance per currency.
    await queryRunner.query(`
      CREATE FUNCTION ledger_check_journal_balanced() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF (SELECT count(*) FROM ledger_entries WHERE journal_entry_id = NEW.journal_entry_id) < 2
           OR EXISTS (
             SELECT 1
               FROM ledger_entries
              WHERE journal_entry_id = NEW.journal_entry_id
              GROUP BY currency
             HAVING SUM(CASE direction WHEN 'DEBIT' THEN amount_minor ELSE -amount_minor END) <> 0
           ) THEN
          RAISE EXCEPTION 'journal entry % is not balanced', NEW.journal_entry_id
            USING ERRCODE = 'check_violation';
        END IF;
        RETURN NULL;
      END
      $$
    `);
    await queryRunner.query(`
      CREATE CONSTRAINT TRIGGER trg_ledger_entries_balanced
        AFTER INSERT ON ledger_entries
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION ledger_check_journal_balanced()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE ledger_entries');
    await queryRunner.query('DROP TABLE journal_entries');
    await queryRunner.query('DROP FUNCTION ledger_check_journal_balanced()');
    await queryRunner.query('DROP FUNCTION ledger_forbid_mutation()');
    await queryRunner.query('DROP TABLE accounts');
    await queryRunner.query('DROP FUNCTION next_account_number()');
    await queryRunner.query('DROP SEQUENCE account_number_seq');
  }
}
