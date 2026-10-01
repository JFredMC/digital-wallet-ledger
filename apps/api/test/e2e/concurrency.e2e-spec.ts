import {
  expectLedgerConsistent,
  fundedUser,
  getWallet,
  newIdempotencyKey,
  transfer,
} from '../utils/ledger';
import { createTestApp, resetDatabase, type TestContext } from '../utils/test-app';

/**
 * Real parallel HTTP requests against a real PostgreSQL. These are the tests
 * that would catch lost updates, overdrafts, deadlocks and double charges.
 */
describe('Concurrency (e2e)', () => {
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

  it('50 parallel transfers from one wallet never overdraw it', async () => {
    const ana = await fundedUser(ctx.app, 100_000_000);
    const luis = await fundedUser(ctx.app, 0);
    const amount = 3_000_000; // 100M / 3M → only 33 can succeed

    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        transfer(ctx.app, ana.accessToken, {
          fromAccountId: ana.wallet.id,
          toAccountNumber: luis.wallet.number,
          amountMinor: amount,
        }),
      ),
    );

    const ok = results.filter((r) => r.status === 201);
    const rejected = results.filter((r) => r.status === 422);
    expect(ok).toHaveLength(33);
    expect(rejected).toHaveLength(17);
    expect(rejected.every((r) => r.body.code === 'INSUFFICIENT_FUNDS')).toBe(true);

    expect(await balanceOf(ana.accessToken)).toBe(1_000_000);
    expect(await balanceOf(luis.accessToken)).toBe(99_000_000);

    // No lost updates: each success saw the previous one's balance, so the
    // running balances form an unbroken chain 97M, 94M, …, 1M.
    const balancesAfter = ok.map((r) => r.body.balanceAfterMinor as number).sort((a, b) => b - a);
    expect(balancesAfter).toEqual(Array.from({ length: 33 }, (_, i) => 97_000_000 - i * amount));
    const [{ count }] = await ctx.dataSource.query(
      'SELECT count(*)::int AS count FROM transfers WHERE from_account_id = $1',
      [ana.wallet.id],
    );
    expect(count).toBe(33);
  });

  it('50 parallel transfers in both directions between two wallets do not deadlock', async () => {
    const ana = await fundedUser(ctx.app, 50_000_000);
    const luis = await fundedUser(ctx.app, 50_000_000);

    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        i % 2 === 0
          ? transfer(ctx.app, ana.accessToken, {
              fromAccountId: ana.wallet.id,
              toAccountNumber: luis.wallet.number,
              amountMinor: 1_000_000,
            })
          : transfer(ctx.app, luis.accessToken, {
              fromAccountId: luis.wallet.id,
              toAccountNumber: ana.wallet.number,
              amountMinor: 1_000_000,
            }),
      ),
    );

    expect(results.map((r) => r.status)).toEqual(Array(50).fill(201));
    expect(await balanceOf(ana.accessToken)).toBe(50_000_000);
    expect(await balanceOf(luis.accessToken)).toBe(50_000_000);
  });

  it('many senders paying one recipient at once all land', async () => {
    const shop = await fundedUser(ctx.app, 0, 'Corner Shop');
    const senders = await Promise.all(
      Array.from({ length: 15 }, () => fundedUser(ctx.app, 2_000_000)),
    );

    const results = await Promise.all(
      senders.map((sender) =>
        transfer(ctx.app, sender.accessToken, {
          fromAccountId: sender.wallet.id,
          toAccountNumber: shop.wallet.number,
          amountMinor: 1_500_000,
        }),
      ),
    );

    expect(results.map((r) => r.status)).toEqual(Array(15).fill(201));
    expect(await balanceOf(shop.accessToken)).toBe(15 * 1_500_000);
  });

  it('20 parallel retries with the same Idempotency-Key move money exactly once', async () => {
    const ana = await fundedUser(ctx.app, 10_000_000);
    const luis = await fundedUser(ctx.app, 0);
    const key = newIdempotencyKey();
    const body = {
      fromAccountId: ana.wallet.id,
      toAccountNumber: luis.wallet.number,
      amountMinor: 4_000_000,
    };

    const results = await Promise.all(
      Array.from({ length: 20 }, () => transfer(ctx.app, ana.accessToken, body, key)),
    );

    expect(results.map((r) => r.status)).toEqual(Array(20).fill(201));
    expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
    expect(results.filter((r) => r.headers['idempotent-replayed'] === 'true')).toHaveLength(19);
    expect(results.every((r) => r.body.balanceAfterMinor === 6_000_000)).toBe(true);
    expect(await balanceOf(ana.accessToken)).toBe(6_000_000);
    expect(await balanceOf(luis.accessToken)).toBe(4_000_000);
  });
});
