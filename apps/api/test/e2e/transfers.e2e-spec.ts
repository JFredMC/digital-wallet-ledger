import request from 'supertest';
import { registerUser } from '../utils/auth';
import {
  deposit,
  expectLedgerConsistent,
  fundDirectly,
  fundedUser,
  getWallet,
  newIdempotencyKey,
  transfer,
} from '../utils/ledger';
import { createTestApp, resetDatabase, type TestContext } from '../utils/test-app';

// Defaults: MAX_TRANSFER_MINOR = 500_000_000, DAILY_TRANSFER_LIMIT_MINOR = 2_000_000_000.
const MAX_TRANSFER = 500_000_000;

describe('Transfers (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.dataSource);
  });

  afterEach(async () => {
    await expectLedgerConsistent(ctx.app, ctx.dataSource);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const balanceOf = async (accessToken: string) =>
    (await getWallet(ctx.app, accessToken)).balanceMinor;

  it('moves money between wallets with a balanced TRANSFER journal entry', async () => {
    const ana = await fundedUser(ctx.app, 10_000_000, 'Ana María Gómez');
    const luis = await fundedUser(ctx.app, 0, 'Luis Alberto Pérez');

    const res = await transfer(ctx.app, ana.accessToken, {
      fromAccountId: ana.wallet.id,
      toAccountNumber: luis.wallet.number,
      amountMinor: 2_500_000,
      description: '  Lunch 🍕  ',
    }).expect(201);

    expect(res.body).toEqual({
      id: expect.any(String),
      status: 'COMPLETED',
      journalEntryId: expect.any(String),
      fromAccountId: ana.wallet.id,
      recipient: {
        holderName: 'Luis A***',
        accountNumber: `****${luis.wallet.number.slice(-4)}`,
      },
      amountMinor: 2_500_000,
      currency: 'COP',
      description: 'Lunch 🍕',
      balanceAfterMinor: 7_500_000,
      createdAt: expect.any(String),
    });
    expect(await balanceOf(ana.accessToken)).toBe(7_500_000);
    expect(await balanceOf(luis.accessToken)).toBe(2_500_000);

    const lines = await ctx.dataSource.query(
      `SELECT je.type, le.account_id, le.direction, le.amount_minor, le.balance_after_minor
         FROM ledger_entries le JOIN journal_entries je ON je.id = le.journal_entry_id
        WHERE le.journal_entry_id = $1 ORDER BY le.id`,
      [res.body.journalEntryId],
    );
    expect(lines).toEqual([
      {
        type: 'TRANSFER',
        account_id: ana.wallet.id,
        direction: 'DEBIT',
        amount_minor: '2500000',
        balance_after_minor: '7500000',
      },
      {
        type: 'TRANSFER',
        account_id: luis.wallet.id,
        direction: 'CREDIT',
        amount_minor: '2500000',
        balance_after_minor: '2500000',
      },
    ]);
    const [row] = await ctx.dataSource.query(
      'SELECT from_account_id, to_account_id, initiated_by FROM transfers WHERE id = $1',
      [res.body.id],
    );
    expect(row).toEqual({
      from_account_id: ana.wallet.id,
      to_account_id: luis.wallet.id,
      initiated_by: ana.userId,
    });
  });

  it('resolves the recipient by alias', async () => {
    const ana = await fundedUser(ctx.app, 1_000_000);
    const luis = await fundedUser(ctx.app, 0, 'Luis Pérez');
    await ctx.dataSource.query(`UPDATE accounts SET alias = '@luis.e2e' WHERE id = $1`, [
      luis.wallet.id,
    ]);

    const res = await transfer(ctx.app, ana.accessToken, {
      fromAccountId: ana.wallet.id,
      toAlias: '@LUIS.E2E',
      amountMinor: 400_000,
    }).expect(201);
    expect(res.body.recipient.holderName).toBe('Luis P***');
    expect(await balanceOf(luis.accessToken)).toBe(400_000);
  });

  it('rejects requests without authentication', async () => {
    await request(ctx.app.getHttpServer())
      .post('/api/v1/transfers')
      .set('Idempotency-Key', newIdempotencyKey())
      .send({})
      .expect(401);
  });

  describe('validation', () => {
    it.each([
      ['no recipient', { amountMinor: 100 }],
      ['two recipients', { amountMinor: 100, toAccountNumber: '1000-0000-0001', toAlias: '@x1' }],
      ['a malformed account number', { amountMinor: 100, toAccountNumber: '12345' }],
      ['a zero amount', { amountMinor: 0, toAccountNumber: '1000-0000-0001' }],
      ['a fractional amount', { amountMinor: 1.5, toAccountNumber: '1000-0000-0001' }],
      ['a string amount', { amountMinor: '100', toAccountNumber: '1000-0000-0001' }],
      ['an unknown field', { amountMinor: 100, toAccountNumber: '1000-0000-0001', fee: 0 }],
    ])('rejects %s with 400', async (_label, body) => {
      const user = await fundedUser(ctx.app, 1_000);
      const res = await transfer(ctx.app, user.accessToken, {
        fromAccountId: user.wallet.id,
        ...(body as object),
      } as never).expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('requires a well-formed Idempotency-Key', async () => {
      const user = await fundedUser(ctx.app, 1_000);
      const body = {
        fromAccountId: user.wallet.id,
        toAccountNumber: '1000-0000-0001',
        amountMinor: 1,
      };
      const missing = await request(ctx.app.getHttpServer())
        .post('/api/v1/transfers')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send(body)
        .expect(400);
      expect(missing.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');

      const invalid = await transfer(ctx.app, user.accessToken, body, 'bad key!').expect(400);
      expect(invalid.body.code).toBe('IDEMPOTENCY_KEY_INVALID');
    });
  });

  describe('business rules', () => {
    it('rejects insufficient funds without moving any money', async () => {
      const ana = await fundedUser(ctx.app, 1_000);
      const luis = await fundedUser(ctx.app, 0);
      const res = await transfer(ctx.app, ana.accessToken, {
        fromAccountId: ana.wallet.id,
        toAccountNumber: luis.wallet.number,
        amountMinor: 1_001,
      }).expect(422);
      expect(res.body.code).toBe('INSUFFICIENT_FUNDS');
      expect(await balanceOf(ana.accessToken)).toBe(1_000);
      expect(await balanceOf(luis.accessToken)).toBe(0);
    });

    it('can send the whole balance, down to exactly zero', async () => {
      const ana = await fundedUser(ctx.app, 1_000);
      const luis = await fundedUser(ctx.app, 0);
      const res = await transfer(ctx.app, ana.accessToken, {
        fromAccountId: ana.wallet.id,
        toAccountNumber: luis.wallet.number,
        amountMinor: 1_000,
      }).expect(201);
      expect(res.body.balanceAfterMinor).toBe(0);
    });

    it('returns 404 for an unknown or frozen recipient', async () => {
      const ana = await fundedUser(ctx.app, 1_000);
      const luis = await fundedUser(ctx.app, 0);
      const unknown = await transfer(ctx.app, ana.accessToken, {
        fromAccountId: ana.wallet.id,
        toAccountNumber: '1000-9999-9999',
        amountMinor: 10,
      }).expect(404);
      expect(unknown.body.code).toBe('RECIPIENT_NOT_FOUND');

      await ctx.dataSource.query(`UPDATE accounts SET status = 'FROZEN' WHERE id = $1`, [
        luis.wallet.id,
      ]);
      const frozen = await transfer(ctx.app, ana.accessToken, {
        fromAccountId: ana.wallet.id,
        toAccountNumber: luis.wallet.number,
        amountMinor: 10,
      }).expect(404);
      expect(frozen.body.code).toBe('RECIPIENT_NOT_FOUND');
    });

    it('cannot send to a system account', async () => {
      const ana = await fundedUser(ctx.app, 1_000);
      const res = await transfer(ctx.app, ana.accessToken, {
        fromAccountId: ana.wallet.id,
        toAccountNumber: '9000-0000-0002',
        amountMinor: 10,
      }).expect(404);
      expect(res.body.code).toBe('RECIPIENT_NOT_FOUND');
    });

    it("cannot send from someone else's wallet (404, anti-BOLA)", async () => {
      const victim = await fundedUser(ctx.app, 1_000);
      const thief = await fundedUser(ctx.app, 0);
      const res = await transfer(ctx.app, thief.accessToken, {
        fromAccountId: victim.wallet.id,
        toAccountNumber: thief.wallet.number,
        amountMinor: 1_000,
      }).expect(404);
      expect(res.body.code).toBe('ACCOUNT_NOT_FOUND');
      expect(await balanceOf(victim.accessToken)).toBe(1_000);
    });

    it('rejects a transfer to the same account', async () => {
      const ana = await fundedUser(ctx.app, 1_000);
      const res = await transfer(ctx.app, ana.accessToken, {
        fromAccountId: ana.wallet.id,
        toAccountNumber: ana.wallet.number,
        amountMinor: 10,
      }).expect(422);
      expect(res.body.code).toBe('SAME_ACCOUNT_TRANSFER');
    });

    it('rejects a frozen source wallet', async () => {
      const ana = await fundedUser(ctx.app, 1_000);
      const luis = await fundedUser(ctx.app, 0);
      await ctx.dataSource.query(`UPDATE accounts SET status = 'FROZEN' WHERE id = $1`, [
        ana.wallet.id,
      ]);
      const res = await transfer(ctx.app, ana.accessToken, {
        fromAccountId: ana.wallet.id,
        toAccountNumber: luis.wallet.number,
        amountMinor: 10,
      }).expect(422);
      expect(res.body.code).toBe('ACCOUNT_NOT_ACTIVE');
    });

    it('enforces the per-transfer and rolling daily limits', async () => {
      const ana = await fundedUser(ctx.app, 0);
      const luis = await fundedUser(ctx.app, 0);
      await fundDirectly(ctx.app, ctx.dataSource, ana.wallet.id, 3_000_000_000n);
      const send = (amountMinor: number) =>
        transfer(ctx.app, ana.accessToken, {
          fromAccountId: ana.wallet.id,
          toAccountNumber: luis.wallet.number,
          amountMinor,
        });

      const tooBig = await send(MAX_TRANSFER + 1).expect(422);
      expect(tooBig.body).toMatchObject({
        code: 'TRANSFER_LIMIT_EXCEEDED',
        maxAmountMinor: MAX_TRANSFER,
      });

      for (let i = 0; i < 3; i++) await send(MAX_TRANSFER).expect(201);
      await send(MAX_TRANSFER - 1).expect(201);
      const overDaily = await send(2).expect(422);
      expect(overDaily.body).toMatchObject({
        code: 'DAILY_TRANSFER_LIMIT_EXCEEDED',
        remainingMinor: 1,
      });
      await send(1).expect(201);
      expect(await balanceOf(luis.accessToken)).toBe(2_000_000_000);
    });
  });

  describe('idempotency', () => {
    async function pair() {
      const ana = await fundedUser(ctx.app, 10_000);
      const luis = await fundedUser(ctx.app, 0);
      const body = {
        fromAccountId: ana.wallet.id,
        toAccountNumber: luis.wallet.number,
        amountMinor: 1_000,
      };
      return { ana, luis, body };
    }

    it('replays a retried transfer: same response, money moves once', async () => {
      const { ana, luis, body } = await pair();
      const key = newIdempotencyKey();

      const first = await transfer(ctx.app, ana.accessToken, body, key).expect(201);
      const retry = await transfer(ctx.app, ana.accessToken, body, key).expect(201);

      expect(first.headers['idempotent-replayed']).toBeUndefined();
      expect(retry.headers['idempotent-replayed']).toBe('true');
      expect(retry.body).toEqual(first.body);
      expect(await balanceOf(ana.accessToken)).toBe(9_000);
      expect(await balanceOf(luis.accessToken)).toBe(1_000);
      const [{ count }] = await ctx.dataSource.query(
        'SELECT count(*)::int AS count FROM transfers WHERE from_account_id = $1',
        [ana.wallet.id],
      );
      expect(count).toBe(1);
    });

    it('treats a reordered but identical body as the same request', async () => {
      const { ana, body } = await pair();
      const key = newIdempotencyKey();
      const first = await transfer(ctx.app, ana.accessToken, body, key).expect(201);
      const reordered = {
        amountMinor: body.amountMinor,
        toAccountNumber: body.toAccountNumber,
        fromAccountId: body.fromAccountId,
      };
      const retry = await transfer(ctx.app, ana.accessToken, reordered, key).expect(201);
      expect(retry.body.id).toBe(first.body.id);
    });

    it('rejects a key reused with a different body or on another endpoint', async () => {
      const { ana, body } = await pair();
      const key = newIdempotencyKey();
      await transfer(ctx.app, ana.accessToken, body, key).expect(201);

      const changed = await transfer(
        ctx.app,
        ana.accessToken,
        { ...body, amountMinor: 2_000 },
        key,
      );
      expect(changed.status).toBe(422);
      expect(changed.body.code).toBe('IDEMPOTENCY_KEY_REUSED');

      const otherEndpoint = await deposit(ctx.app, ana.accessToken, ana.wallet.id, 1_000, key);
      expect(otherEndpoint.status).toBe(422);
      expect(otherEndpoint.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
      expect(await balanceOf(ana.accessToken)).toBe(9_000);
    });

    it('scopes keys per user', async () => {
      const a = await pair();
      const b = await pair();
      const key = newIdempotencyKey();
      const first = await transfer(ctx.app, a.ana.accessToken, a.body, key).expect(201);
      const second = await transfer(ctx.app, b.ana.accessToken, b.body, key).expect(201);
      expect(second.headers['idempotent-replayed']).toBeUndefined();
      expect(second.body.id).not.toBe(first.body.id);
    });

    it('does not store failures: the same key works once the problem is fixed', async () => {
      const { ana, body } = await pair();
      const key = newIdempotencyKey();
      const tooMuch = { ...body, amountMinor: 50_000 };

      const failed = await transfer(ctx.app, ana.accessToken, tooMuch, key).expect(422);
      expect(failed.body.code).toBe('INSUFFICIENT_FUNDS');

      await deposit(ctx.app, ana.accessToken, ana.wallet.id, 40_000).expect(201);
      const ok = await transfer(ctx.app, ana.accessToken, tooMuch, key).expect(201);
      expect(ok.headers['idempotent-replayed']).toBeUndefined();
      expect(ok.body.balanceAfterMinor).toBe(0);
    });

    it('lets an expired key be used again for a new operation', async () => {
      const { ana, body } = await pair();
      const key = newIdempotencyKey();
      const first = await transfer(ctx.app, ana.accessToken, body, key).expect(201);
      await ctx.dataSource.query(
        `UPDATE idempotency_keys SET expires_at = now() - interval '1 second'
          WHERE user_id = $1 AND key = $2`,
        [ana.userId, key],
      );

      const again = await transfer(ctx.app, ana.accessToken, body, key).expect(201);
      expect(again.headers['idempotent-replayed']).toBeUndefined();
      expect(again.body.id).not.toBe(first.body.id);
      expect(await balanceOf(ana.accessToken)).toBe(8_000);
    });
  });

  it('keeps transfers append-only', async () => {
    const { ana, luis } = {
      ana: await fundedUser(ctx.app, 1_000),
      luis: await registerUser(ctx.app),
    };
    const luisWallet = await getWallet(ctx.app, luis.accessToken);
    const res = await transfer(ctx.app, ana.accessToken, {
      fromAccountId: ana.wallet.id,
      toAccountNumber: luisWallet.number,
      amountMinor: 100,
    }).expect(201);
    await expect(
      ctx.dataSource.query('UPDATE transfers SET amount_minor = 1 WHERE id = $1', [res.body.id]),
    ).rejects.toThrow(/append-only/);
    await expect(
      ctx.dataSource.query('DELETE FROM transfers WHERE id = $1', [res.body.id]),
    ).rejects.toThrow(/append-only/);
  });
});
