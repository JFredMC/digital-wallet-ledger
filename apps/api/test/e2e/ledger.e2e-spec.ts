import { registerUser } from '../utils/auth';
import { deposit, expectLedgerConsistent, getWallet } from '../utils/ledger';
import { createTestApp, resetDatabase, type TestContext } from '../utils/test-app';

/** Database-level guarantees that hold even if application code misbehaves. */
describe('Ledger database guarantees (e2e)', () => {
  let ctx: TestContext;
  let walletId: string;
  let journalId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.dataSource);
    const user = await registerUser(ctx.app);
    walletId = (await getWallet(ctx.app, user.accessToken)).id;
    journalId = (await deposit(ctx.app, user.accessToken, walletId, 5_000).expect(201)).body.id;
  });

  afterAll(async () => {
    await expectLedgerConsistent(ctx.app, ctx.dataSource);
    await ctx.app.close();
  });

  const sql = (query: string, params: unknown[] = []) => ctx.dataSource.query(query, params);

  it('ledger_entries cannot be updated', async () => {
    await expect(sql('UPDATE ledger_entries SET amount_minor = 1')).rejects.toThrow(/append-only/);
  });

  it('ledger_entries cannot be deleted', async () => {
    await expect(sql('DELETE FROM ledger_entries')).rejects.toThrow(/append-only/);
  });

  it('journal_entries cannot be updated or deleted', async () => {
    await expect(
      sql(`UPDATE journal_entries SET description = 'tampered' WHERE id = $1`, [journalId]),
    ).rejects.toThrow(/append-only/);
    await expect(sql('DELETE FROM journal_entries WHERE id = $1', [journalId])).rejects.toThrow(
      /append-only/,
    );
  });

  it('an unbalanced journal is rejected at COMMIT and nothing is written', async () => {
    const [{ count: before }] = await sql('SELECT count(*)::int AS count FROM ledger_entries');
    const runner = ctx.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const [journal] = await runner.query(
        `INSERT INTO journal_entries (type) VALUES ('DEPOSIT') RETURNING id`,
      );
      await runner.query(
        `INSERT INTO ledger_entries (journal_entry_id, account_id, direction, amount_minor, currency, balance_after_minor)
         VALUES ($1, $2, 'CREDIT', 999, 'COP', 999)`,
        [journal.id, walletId],
      );
      await expect(runner.commitTransaction()).rejects.toThrow(/not balanced/);
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }
    const [{ count: after }] = await sql('SELECT count(*)::int AS count FROM ledger_entries');
    expect(after).toBe(before);
  });

  it('a user wallet balance can never be negative (CHECK constraint)', async () => {
    await expect(
      sql('UPDATE accounts SET balance_minor = -1 WHERE id = $1', [walletId]),
    ).rejects.toThrow(/chk_wallet_non_negative/);
  });

  it('a line must use its account currency', async () => {
    const runner = ctx.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const [journal] = await runner.query(
        `INSERT INTO journal_entries (type) VALUES ('DEPOSIT') RETURNING id`,
      );
      await expect(
        runner.query(
          `INSERT INTO ledger_entries (journal_entry_id, account_id, direction, amount_minor, currency, balance_after_minor)
           VALUES ($1, $2, 'CREDIT', 1, 'USD', 1)`,
          [journal.id, walletId],
        ),
      ).rejects.toThrow(/fk_ledger_entries_account_currency/);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });

  it('each user has at most one wallet per currency', async () => {
    const [{ user_id }] = await sql('SELECT user_id FROM accounts WHERE id = $1', [walletId]);
    await expect(
      sql(`INSERT INTO accounts (user_id, type, currency) VALUES ($1, 'USER_WALLET', 'COP')`, [
        user_id,
      ]),
    ).rejects.toThrow(/ux_accounts_user_currency/);
  });
});
