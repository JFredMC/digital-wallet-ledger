import request from 'supertest';
import { registerUser } from '../utils/auth';
import { deposit, expectLedgerConsistent, fundedUser, transfer } from '../utils/ledger';
import { createTestApp, resetDatabase, type TestContext } from '../utils/test-app';

interface Item {
  id: string;
  type: string;
  direction: 'IN' | 'OUT';
  amountMinor: number;
  balanceAfterMinor: number;
  description: string | null;
  counterparty: { holderName: string; accountNumber: string } | null;
  transferId: string | null;
  createdAt: string;
}

describe('Transaction history (e2e)', () => {
  let ctx: TestContext;
  let ana: Awaited<ReturnType<typeof fundedUser>>;
  let luis: Awaited<ReturnType<typeof fundedUser>>;

  const history = (accessToken: string, accountId: string, query: Record<string, unknown> = {}) =>
    request(ctx.app.getHttpServer())
      .get(`/api/v1/accounts/${accountId}/transactions`)
      .query(query)
      .set('Authorization', `Bearer ${accessToken}`);

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.dataSource);

    // Ana: deposit 15M, then sends 1M, 2M, …, 5M to Luis; Luis sends 500k back.
    ana = await fundedUser(ctx.app, 15_000_000, 'Ana María Gómez');
    luis = await fundedUser(ctx.app, 0, 'Luis Alberto Pérez');
    for (let i = 1; i <= 5; i++) {
      await transfer(ctx.app, ana.accessToken, {
        fromAccountId: ana.wallet.id,
        toAccountNumber: luis.wallet.number,
        amountMinor: i * 1_000_000,
        description: `Payment ${i}`,
      }).expect(201);
    }
    await transfer(ctx.app, luis.accessToken, {
      fromAccountId: luis.wallet.id,
      toAccountNumber: ana.wallet.number,
      amountMinor: 500_000,
    }).expect(201);
  });

  afterAll(async () => {
    await expectLedgerConsistent(ctx.app, ctx.dataSource);
    await ctx.app.close();
  });

  it('lists movements newest first, from the account point of view', async () => {
    const res = await history(ana.accessToken, ana.wallet.id).expect(200);
    const items = res.body.items as Item[];

    expect(res.body.nextCursor).toBeNull();
    expect(items).toHaveLength(7);
    expect(items[0]).toEqual({
      id: expect.any(String),
      type: 'TRANSFER',
      direction: 'IN',
      amountMinor: 500_000,
      balanceAfterMinor: 500_000,
      currency: 'COP',
      description: null,
      counterparty: {
        holderName: 'Luis A***',
        accountNumber: `****${luis.wallet.number.slice(-4)}`,
      },
      transferId: expect.any(String),
      createdAt: expect.any(String),
    });
    expect(items[1]).toMatchObject({
      direction: 'OUT',
      amountMinor: 5_000_000,
      balanceAfterMinor: 0,
      description: 'Payment 5',
      counterparty: { holderName: 'Luis A***' },
    });
    expect(items.at(-1)).toMatchObject({
      type: 'DEPOSIT',
      direction: 'IN',
      amountMinor: 15_000_000,
      counterparty: null,
      transferId: null,
    });

    // The recipient sees the same transfer as incoming, with the sender masked.
    const luisView = await history(luis.accessToken, luis.wallet.id).expect(200);
    expect(luisView.body.items[1]).toMatchObject({
      direction: 'IN',
      amountMinor: 5_000_000,
      counterparty: { holderName: 'Ana M***' },
    });
  });

  it('paginates with an opaque cursor without gaps or duplicates', async () => {
    const all = (await history(ana.accessToken, ana.wallet.id).expect(200)).body.items as Item[];

    const seen: Item[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const res = await history(ana.accessToken, ana.wallet.id, {
        limit: 3,
        ...(cursor ? { cursor } : {}),
      }).expect(200);
      seen.push(...(res.body.items as Item[]));
      cursor = res.body.nextCursor ?? undefined;
      pages++;
    } while (cursor);

    expect(pages).toBe(3);
    expect(seen.map((i) => i.id)).toEqual(all.map((i) => i.id));
  });

  it('paginates correctly through rows created in the same instant', async () => {
    // All lines of a journal share created_at (= transaction start); the id
    // tie-breaker must keep pages stable.
    const res1 = await history(ana.accessToken, ana.wallet.id, { limit: 1 }).expect(200);
    const res2 = await history(ana.accessToken, ana.wallet.id, {
      limit: 1,
      cursor: res1.body.nextCursor,
    }).expect(200);
    expect(res2.body.items[0].id).not.toBe(res1.body.items[0].id);
  });

  it('filters by type, direction and amount range', async () => {
    const deposits = await history(ana.accessToken, ana.wallet.id, { type: 'DEPOSIT' });
    expect((deposits.body.items as Item[]).map((i) => i.type)).toEqual(['DEPOSIT']);

    const incoming = await history(ana.accessToken, ana.wallet.id, { direction: 'IN' });
    expect((incoming.body.items as Item[]).map((i) => i.amountMinor)).toEqual([
      500_000, 15_000_000,
    ]);

    const outgoing = await history(ana.accessToken, ana.wallet.id, {
      direction: 'OUT',
      minAmountMinor: 2_000_000,
      maxAmountMinor: 4_000_000,
    });
    expect((outgoing.body.items as Item[]).map((i) => i.amountMinor)).toEqual([
      4_000_000, 3_000_000, 2_000_000,
    ]);
  });

  it('filters by date range', async () => {
    const future = await history(ana.accessToken, ana.wallet.id, {
      from: '2999-01-01T00:00:00Z',
    }).expect(200);
    expect(future.body.items).toEqual([]);

    const past = await history(ana.accessToken, ana.wallet.id, {
      to: '2000-01-01T00:00:00Z',
    }).expect(200);
    expect(past.body.items).toEqual([]);

    const now = await history(ana.accessToken, ana.wallet.id, {
      from: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      to: new Date(Date.now() + 60 * 1000).toISOString(),
    }).expect(200);
    expect(now.body.items).toHaveLength(7);
  });

  it("returns 404 for someone else's account", async () => {
    const res = await history(luis.accessToken, ana.wallet.id).expect(404);
    expect(res.body.code).toBe('ACCOUNT_NOT_FOUND');
  });

  it('returns an empty page for a brand-new wallet', async () => {
    const user = await registerUser(ctx.app);
    const wallet = (
      await request(ctx.app.getHttpServer())
        .get('/api/v1/accounts')
        .set('Authorization', `Bearer ${user.accessToken}`)
    ).body[0];
    const res = await history(user.accessToken, wallet.id).expect(200);
    expect(res.body).toEqual({ items: [], nextCursor: null });
    await deposit(ctx.app, user.accessToken, wallet.id, 1).expect(201);
  });

  it.each([
    ['limit above 100', { limit: 101 }, 'VALIDATION_FAILED'],
    ['limit zero', { limit: 0 }, 'VALIDATION_FAILED'],
    ['unknown type', { type: 'FEE_X' }, 'VALIDATION_FAILED'],
    ['bad direction', { direction: 'DEBIT' }, 'VALIDATION_FAILED'],
    ['bad date', { from: 'yesterday' }, 'VALIDATION_FAILED'],
    ['inverted amounts', { minAmountMinor: 10, maxAmountMinor: 1 }, 'VALIDATION_FAILED'],
    ['unknown filter', { q: 'pizza' }, 'VALIDATION_FAILED'],
    ['malformed cursor', { cursor: 'abc' }, 'INVALID_CURSOR'],
  ])('rejects %s with 400', async (_label, query, code) => {
    const res = await history(ana.accessToken, ana.wallet.id, query).expect(400);
    expect(res.body.code).toBe(code);
  });

  it('rejects a non-UUID account id', async () => {
    await history(ana.accessToken, 'not-a-uuid').expect(400);
  });
});
