import request from 'supertest';
import { registerUser } from '../utils/auth';
import { deposit, expectLedgerConsistent, getWallet, newIdempotencyKey } from '../utils/ledger';
import { createTestApp, resetDatabase, type TestContext } from '../utils/test-app';

// Default DEMO_DEPOSIT_DAILY_LIMIT_MINOR = 100_000_000 ($1.000.000,00 COP).
const DAILY_LIMIT = 100_000_000;

describe('Deposits (e2e)', () => {
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

  it('credits the wallet through a balanced two-line DEPOSIT journal entry', async () => {
    const user = await registerUser(ctx.app);
    const wallet = await getWallet(ctx.app, user.accessToken);

    const res = await deposit(ctx.app, user.accessToken, wallet.id, 2_500_000).expect(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      accountId: wallet.id,
      amountMinor: 2_500_000,
      currency: 'COP',
      balanceAfterMinor: 2_500_000,
      description: 'Demo top-up',
      createdAt: expect.any(String),
    });
    expect((await getWallet(ctx.app, user.accessToken)).balanceMinor).toBe(2_500_000);

    const lines = await ctx.dataSource.query(
      `SELECT je.type, a.type AS account_type, le.direction, le.amount_minor, le.balance_after_minor
         FROM ledger_entries le
         JOIN journal_entries je ON je.id = le.journal_entry_id
         JOIN accounts a ON a.id = le.account_id
        WHERE le.journal_entry_id = $1
        ORDER BY le.id`,
      [res.body.id],
    );
    expect(lines).toEqual([
      {
        type: 'DEPOSIT',
        account_type: 'SYSTEM_FUNDING',
        direction: 'DEBIT',
        amount_minor: '2500000',
        balance_after_minor: '-2500000',
      },
      {
        type: 'DEPOSIT',
        account_type: 'USER_WALLET',
        direction: 'CREDIT',
        amount_minor: '2500000',
        balance_after_minor: '2500000',
      },
    ]);
  });

  it('accumulates balances across deposits', async () => {
    const user = await registerUser(ctx.app);
    const wallet = await getWallet(ctx.app, user.accessToken);
    await deposit(ctx.app, user.accessToken, wallet.id, 1_000).expect(201);
    const res = await deposit(ctx.app, user.accessToken, wallet.id, 234).expect(201);
    expect(res.body.balanceAfterMinor).toBe(1_234);
  });

  it.each([
    ['zero', 0],
    ['negative', -100],
    ['fractional', 10.5],
    ['a numeric string', '1000'],
    ['beyond MAX_SAFE_INTEGER', Number.MAX_SAFE_INTEGER + 2],
  ])('rejects a %s amount with 400', async (_label, amountMinor) => {
    const user = await registerUser(ctx.app);
    const wallet = await getWallet(ctx.app, user.accessToken);
    const res = await request(ctx.app.getHttpServer())
      .post('/api/v1/deposits')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .set('Idempotency-Key', newIdempotencyKey())
      .send({ accountId: wallet.id, amountMinor })
      .expect(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it("can't deposit into someone else's wallet", async () => {
    const owner = await registerUser(ctx.app);
    const other = await registerUser(ctx.app);
    const wallet = await getWallet(ctx.app, owner.accessToken);
    const res = await deposit(ctx.app, other.accessToken, wallet.id, 1_000).expect(404);
    expect(res.body.code).toBe('ACCOUNT_NOT_FOUND');
  });

  it('rejects a frozen wallet', async () => {
    const user = await registerUser(ctx.app);
    const wallet = await getWallet(ctx.app, user.accessToken);
    await ctx.dataSource.query(`UPDATE accounts SET status = 'FROZEN' WHERE id = $1`, [wallet.id]);
    const res = await deposit(ctx.app, user.accessToken, wallet.id, 1_000).expect(422);
    expect(res.body.code).toBe('ACCOUNT_NOT_ACTIVE');
  });

  it('enforces the rolling 24 h limit and reports the remaining amount', async () => {
    const user = await registerUser(ctx.app);
    const wallet = await getWallet(ctx.app, user.accessToken);
    await deposit(ctx.app, user.accessToken, wallet.id, DAILY_LIMIT - 1_000).expect(201);

    const res = await deposit(ctx.app, user.accessToken, wallet.id, 1_001).expect(422);
    expect(res.body).toMatchObject({ code: 'DAILY_DEPOSIT_LIMIT_EXCEEDED', remainingMinor: 1_000 });

    await deposit(ctx.app, user.accessToken, wallet.id, 1_000).expect(201);
    expect((await getWallet(ctx.app, user.accessToken)).balanceMinor).toBe(DAILY_LIMIT);
  });

  it('concurrent deposits cannot jointly exceed the daily limit', async () => {
    const user = await registerUser(ctx.app);
    const wallet = await getWallet(ctx.app, user.accessToken);
    const amount = DAILY_LIMIT * 0.4;

    const results = await Promise.all(
      Array.from({ length: 5 }, () => deposit(ctx.app, user.accessToken, wallet.id, amount)),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 201, 422, 422, 422]);
    expect((await getWallet(ctx.app, user.accessToken)).balanceMinor).toBe(amount * 2);
  });

  describe('idempotency', () => {
    it('requires an Idempotency-Key header', async () => {
      const user = await registerUser(ctx.app);
      const wallet = await getWallet(ctx.app, user.accessToken);
      const res = await request(ctx.app.getHttpServer())
        .post('/api/v1/deposits')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ accountId: wallet.id, amountMinor: 1_000 })
        .expect(400);
      expect(res.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    });

    it('replays a retried deposit instead of crediting twice', async () => {
      const user = await registerUser(ctx.app);
      const wallet = await getWallet(ctx.app, user.accessToken);
      const key = newIdempotencyKey();

      const first = await deposit(ctx.app, user.accessToken, wallet.id, 7_000, key).expect(201);
      expect(first.headers['idempotent-replayed']).toBeUndefined();
      const retry = await deposit(ctx.app, user.accessToken, wallet.id, 7_000, key).expect(201);

      expect(retry.headers['idempotent-replayed']).toBe('true');
      expect(retry.body).toEqual(first.body);
      expect((await getWallet(ctx.app, user.accessToken)).balanceMinor).toBe(7_000);
    });

    it('rejects the same key with a different amount', async () => {
      const user = await registerUser(ctx.app);
      const wallet = await getWallet(ctx.app, user.accessToken);
      const key = newIdempotencyKey();
      await deposit(ctx.app, user.accessToken, wallet.id, 7_000, key).expect(201);

      const res = await deposit(ctx.app, user.accessToken, wallet.id, 8_000, key).expect(422);
      expect(res.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
      expect((await getWallet(ctx.app, user.accessToken)).balanceMinor).toBe(7_000);
    });
  });
});
