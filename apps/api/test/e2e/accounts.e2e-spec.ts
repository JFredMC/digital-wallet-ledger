import request from 'supertest';
import { registerUser } from '../utils/auth';
import { createTestApp, resetDatabase, type TestContext } from '../utils/test-app';

describe('Accounts (e2e)', () => {
  let ctx: TestContext;
  const http = () => request(ctx.app.getHttpServer());

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.dataSource);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('registration opens exactly one empty COP wallet for the new user', async () => {
    const user = await registerUser(ctx.app);
    const res = await http()
      .get('/api/v1/accounts')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);

    expect(res.body).toEqual([
      {
        id: expect.any(String),
        number: expect.stringMatching(/^1000-\d{4}-\d{4}$/),
        alias: null,
        type: 'USER_WALLET',
        currency: 'COP',
        balanceMinor: 0,
        status: 'ACTIVE',
        createdAt: expect.any(String),
      },
    ]);
  });

  it('a failed registration leaves neither a user nor a wallet behind', async () => {
    const { email } = await registerUser(ctx.app);
    const [{ before }] = await ctx.dataSource.query('SELECT count(*)::int AS before FROM accounts');
    await http()
      .post('/api/v1/auth/register')
      .send({ email, password: 'S3cure-passw0rd', fullName: 'Duplicate' })
      .expect(409);
    const [{ after }] = await ctx.dataSource.query('SELECT count(*)::int AS after FROM accounts');
    expect(after).toBe(before);
  });

  it('requires authentication', async () => {
    await http().get('/api/v1/accounts').expect(401);
  });

  describe('GET /accounts/:id', () => {
    it('returns my account', async () => {
      const user = await registerUser(ctx.app);
      const [wallet] = (
        await http().get('/api/v1/accounts').set('Authorization', `Bearer ${user.accessToken}`)
      ).body;
      const res = await http()
        .get(`/api/v1/accounts/${wallet.id}`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);
      expect(res.body.id).toBe(wallet.id);
    });

    it("returns 404 (not 403) for someone else's account (anti-BOLA)", async () => {
      const owner = await registerUser(ctx.app);
      const intruder = await registerUser(ctx.app);
      const [wallet] = (
        await http().get('/api/v1/accounts').set('Authorization', `Bearer ${owner.accessToken}`)
      ).body;

      const res = await http()
        .get(`/api/v1/accounts/${wallet.id}`)
        .set('Authorization', `Bearer ${intruder.accessToken}`)
        .expect(404);
      expect(res.body.code).toBe('ACCOUNT_NOT_FOUND');
    });

    it('rejects a malformed id', async () => {
      const user = await registerUser(ctx.app);
      await http()
        .get('/api/v1/accounts/not-a-uuid')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(400);
    });
  });

  describe('GET /accounts/lookup', () => {
    it('resolves a wallet by number with masked holder data', async () => {
      const recipient = await registerUser(ctx.app, { fullName: 'Luis Alberto Pérez' });
      const sender = await registerUser(ctx.app);
      const [wallet] = (
        await http().get('/api/v1/accounts').set('Authorization', `Bearer ${recipient.accessToken}`)
      ).body;

      const res = await http()
        .get('/api/v1/accounts/lookup')
        .query({ number: wallet.number })
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .expect(200);
      expect(res.body).toEqual({
        holderName: 'Luis A***',
        accountNumber: `****${wallet.number.slice(-4)}`,
        alias: null,
        currency: 'COP',
      });
    });

    it('resolves a wallet by alias (case-insensitive)', async () => {
      const recipient = await registerUser(ctx.app, { fullName: 'Marta Ruiz' });
      await ctx.dataSource.query(`UPDATE accounts SET alias = '@marta' WHERE user_id = $1`, [
        recipient.userId,
      ]);
      const res = await http()
        .get('/api/v1/accounts/lookup')
        .query({ alias: '@MARTA' })
        .set('Authorization', `Bearer ${recipient.accessToken}`)
        .expect(200);
      expect(res.body).toMatchObject({ holderName: 'Marta R***', alias: '@marta' });
    });

    it('does not expose system accounts or unknown numbers', async () => {
      const user = await registerUser(ctx.app);
      for (const number of ['9000-0000-0001', '1000-9999-9999']) {
        const res = await http()
          .get('/api/v1/accounts/lookup')
          .query({ number })
          .set('Authorization', `Bearer ${user.accessToken}`)
          .expect(404);
        expect(res.body.code).toBe('ACCOUNT_NOT_FOUND');
      }
    });

    it('requires exactly one well-formed criterion', async () => {
      const user = await registerUser(ctx.app);
      const auth = { Authorization: `Bearer ${user.accessToken}` };
      await http().get('/api/v1/accounts/lookup').set(auth).expect(400);
      await http()
        .get('/api/v1/accounts/lookup')
        .query({ number: '1000-0000-0001', alias: '@x' })
        .set(auth)
        .expect(400);
      await http().get('/api/v1/accounts/lookup').query({ number: '12' }).set(auth).expect(400);
    });
  });
});
