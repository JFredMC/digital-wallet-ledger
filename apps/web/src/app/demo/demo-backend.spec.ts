import {
  HttpClient,
  HttpErrorResponse,
  type HttpResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type {
  Account,
  AccountLookup,
  AuthResponse,
  Deposit,
  TransactionPage,
  Transfer,
} from '../core/api/api.models';
import { WalletApi } from '../core/api/wallet-api.service';
import { AuthService } from '../core/auth/auth.service';
import { authInterceptor } from '../core/http/auth.interceptor';
import { DAY_MS, type DemoDb } from './demo-db';
import { DEMO_CLOCK, DEMO_STORAGE_KEY, DemoBackend } from './demo-backend';
import { DEMO_LATENCY_MS, demoBackendInterceptor } from './demo-backend.interceptor';
import { DEMO_CREDENTIALS, DEMO_PASSWORD } from './demo-seed';

const START = Date.parse('2026-10-01T15:00:00.000Z');
const ANA = DEMO_CREDENTIALS[0];
const LUIS = DEMO_CREDENTIALS[1];

interface CallOptions {
  body?: unknown;
  token?: string;
  key?: string;
  params?: Record<string, string>;
}

describe('DemoBackend (in-browser API for the GitHub Pages demo)', () => {
  let now: number;
  let http: HttpClient;

  function configure(extraInterceptors = false) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(
          withInterceptors(
            extraInterceptors
              ? [authInterceptor, demoBackendInterceptor]
              : [demoBackendInterceptor],
          ),
        ),
        provideRouter([]),
        { provide: DEMO_LATENCY_MS, useValue: 0 },
        { provide: DEMO_CLOCK, useValue: () => now },
      ],
    });
    http = TestBed.inject(HttpClient);
  }

  beforeEach(() => {
    localStorage.clear();
    now = START;
  });

  async function call<T>(method: string, url: string, o: CallOptions = {}) {
    const headers: Record<string, string> = {};
    if (o.token) headers['Authorization'] = `Bearer ${o.token}`;
    if (o.key) headers['Idempotency-Key'] = o.key;
    return firstValueFrom(
      http.request<T>(method, `/api/v1${url}`, {
        body: o.body,
        headers,
        params: o.params,
        observe: 'response',
      }),
    ) as Promise<HttpResponse<T>>;
  }

  /** Resolves with the problem+json body of a failed call. */
  async function fail(method: string, url: string, o: CallOptions = {}) {
    const error = await call(method, url, o).then(
      () => {
        throw new Error(`${method} ${url} should have failed`);
      },
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(HttpErrorResponse);
    const res = error as HttpErrorResponse;
    expect(res.headers.get('Content-Type')).toBe('application/problem+json');
    return { status: res.status, ...(res.error as Record<string, unknown>) } as {
      status: number;
      code: string;
      [key: string]: unknown;
    };
  }

  async function login(credential = ANA) {
    const res = await call<AuthResponse>('POST', '/auth/login', {
      body: { email: credential.email, password: credential.password },
    });
    const token = res.body!.accessToken;
    const [wallet] = (await call<Account[]>('GET', '/accounts', { token })).body!;
    return { token, wallet, user: res.body!.user };
  }

  const stored = () => JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY)!) as DemoDb;
  let keySeq = 0;
  const key = () => `test-key-${++keySeq}-${Math.random().toString(36).slice(2)}`;

  describe('seed data', () => {
    beforeEach(() => configure());

    it('creates the three sample users with consistent ledgers', async () => {
      const ana = await login(ANA);
      expect(ana.user.fullName).toBe('Ana María Gómez');
      expect(ana.wallet).toMatchObject({
        number: '1000-0000-0001',
        alias: 'ana',
        balanceMinor: 138_500_000,
        currency: 'COP',
        type: 'USER_WALLET',
        status: 'ACTIVE',
      });

      const db = stored();
      expect(db.users.map((u) => u.fullName)).toEqual(DEMO_CREDENTIALS.map((c) => c.fullName));
      expect(JSON.stringify(db)).not.toContain(DEMO_PASSWORD); // only salted hashes
      for (const account of db.accounts) {
        const movements = db.movements.filter((m) => m.accountId === account.id);
        const total = movements.reduce(
          (sum, m) => sum + (m.direction === 'IN' ? m.amountMinor : -m.amountMinor),
          0,
        );
        expect(total).toBe(account.balanceMinor);
        expect(movements.at(-1)?.balanceAfterMinor).toBe(account.balanceMinor);
      }
      // Every transfer has a debit and a credit with the same journal id.
      const transfers = db.movements.filter((m) => m.type === 'TRANSFER');
      for (const debit of transfers.filter((m) => m.direction === 'OUT')) {
        expect(transfers.filter((m) => m.id === debit.id).map((m) => m.direction)).toEqual([
          'OUT',
          'IN',
        ]);
      }
      // Older than 24 h: the daily limits start fresh.
      expect(db.movements.every((m) => Date.parse(m.createdAt) < START - DAY_MS)).toBe(true);
    });

    it('persists across instances, reseeds corrupted data and resets on demand', async () => {
      const { token, wallet } = await login();
      await call('POST', '/deposits', {
        token,
        key: key(),
        body: { accountId: wallet.id, amountMinor: 1_000_000 },
      });
      TestBed.resetTestingModule();
      configure();
      expect((await login()).wallet.balanceMinor).toBe(139_500_000);

      await TestBed.inject(DemoBackend).reset();
      const db = stored();
      expect(db.session).toBeNull();
      expect((await login()).wallet.balanceMinor).toBe(138_500_000);

      localStorage.setItem(DEMO_STORAGE_KEY, '{not json');
      expect((await login()).wallet.balanceMinor).toBe(138_500_000);
    });
  });

  describe('auth', () => {
    beforeEach(() => configure());

    it('rejects wrong credentials with the API problem+json shape', async () => {
      const problem = await fail('POST', '/auth/login', {
        body: { email: ANA.email, password: 'Wrong-pass1' },
      });
      expect(problem).toMatchObject({
        status: 401,
        type: 'https://errors.wallet.dev/invalid-credentials',
        title: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS',
        instance: '/api/v1/auth/login',
      });
      expect(problem['requestId']).toMatch(/^demo-/);
    });

    it('registers a user with an empty COP wallet; emails are unique', async () => {
      const res = await call<AuthResponse>('POST', '/auth/register', {
        body: { email: ' Carla@Example.com ', password: 'Carla-pass1', fullName: 'Carla Ruiz' },
      });
      expect(res.status).toBe(201);
      expect(res.body!.user).toMatchObject({ email: 'carla@example.com', role: 'USER' });
      const accounts = await call<Account[]>('GET', '/accounts', { token: res.body!.accessToken });
      expect(accounts.body).toEqual([
        expect.objectContaining({ number: '1000-0000-0004', alias: null, balanceMinor: 0 }),
      ]);

      expect(
        await fail('POST', '/auth/register', {
          body: { email: 'carla@example.com', password: 'Carla-pass1', fullName: 'Carla' },
        }),
      ).toMatchObject({ status: 409, code: 'EMAIL_ALREADY_REGISTERED' });
      const invalid = await fail('POST', '/auth/register', {
        body: { email: 'nope', password: 'short', fullName: 'C', extra: true },
      });
      expect(invalid).toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
      expect(invalid['errors']).toEqual(['property extra should not exist']);
    });

    it('requires a valid bearer token', async () => {
      expect(await fail('GET', '/accounts')).toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
      expect(await fail('GET', '/auth/me', { token: 'demo.garbage' })).toMatchObject({
        status: 401,
      });
      const { token } = await login();
      expect((await call('GET', '/auth/me', { token })).body).toMatchObject({ email: ANA.email });
    });

    it('expires access tokens; refresh works until logout (simulated cookie)', async () => {
      const { token } = await login();
      now += 16 * 60 * 1000;
      expect(await fail('GET', '/accounts', { token })).toMatchObject({ code: 'UNAUTHORIZED' });

      const refreshed = await call<AuthResponse>('POST', '/auth/refresh');
      expect(refreshed.body!.user.email).toBe(ANA.email);
      const fresh = refreshed.body!.accessToken;
      expect((await call('GET', '/accounts', { token: fresh })).status).toBe(200);

      expect((await call('POST', '/auth/logout')).status).toBe(204);
      expect(await fail('GET', '/accounts', { token: fresh })).toMatchObject({ status: 401 });
      expect(await fail('POST', '/auth/refresh')).toMatchObject({
        status: 401,
        code: 'INVALID_REFRESH_TOKEN',
      });
    });

    it('a new login replaces the browser session', async () => {
      const ana = await login(ANA);
      await login(LUIS);
      expect(await fail('GET', '/accounts', { token: ana.token })).toMatchObject({ status: 401 });
    });
  });

  describe('deposits', () => {
    beforeEach(() => configure());

    it('requires a valid Idempotency-Key', async () => {
      const { token, wallet } = await login();
      const body = { accountId: wallet.id, amountMinor: 100 };
      expect(await fail('POST', '/deposits', { token, body })).toMatchObject({
        status: 400,
        code: 'IDEMPOTENCY_KEY_REQUIRED',
      });
      expect(await fail('POST', '/deposits', { token, body, key: 'bad key!' })).toMatchObject({
        status: 400,
        code: 'IDEMPOTENCY_KEY_INVALID',
      });
    });

    it('credits once per key: replays the stored response, rejects a different body', async () => {
      const { token, wallet } = await login();
      const k = key();
      const body = { accountId: wallet.id, amountMinor: 5_000_000 };
      const first = await call<Deposit>('POST', '/deposits', { token, key: k, body });
      expect(first.status).toBe(201);
      expect(first.body).toMatchObject({
        amountMinor: 5_000_000,
        balanceAfterMinor: 143_500_000,
        description: 'Demo top-up',
      });
      expect(first.headers.has('Idempotent-Replayed')).toBe(false);

      const replay = await call<Deposit>('POST', '/deposits', { token, key: k, body });
      expect(replay.status).toBe(201);
      expect(replay.body).toEqual(first.body);
      expect(replay.headers.get('Idempotent-Replayed')).toBe('true');

      expect(
        await fail('POST', '/deposits', { token, key: k, body: { ...body, amountMinor: 1 } }),
      ).toMatchObject({ status: 422, code: 'IDEMPOTENCY_KEY_REUSED' });
      expect((await call<Account[]>('GET', '/accounts', { token })).body![0].balanceMinor).toBe(
        143_500_000,
      );
    });

    it('enforces the rolling 24 h deposit limit', async () => {
      const { token, wallet } = await login();
      const deposit = (amountMinor: number, t = token) =>
        call('POST', '/deposits', {
          token: t,
          key: key(),
          body: { accountId: wallet.id, amountMinor },
        });
      await deposit(70_000_000);
      const problem = await fail('POST', '/deposits', {
        token,
        key: key(),
        body: { accountId: wallet.id, amountMinor: 40_000_000 },
      });
      expect(problem).toMatchObject({
        status: 422,
        code: 'DAILY_DEPOSIT_LIMIT_EXCEEDED',
        remainingMinor: 30_000_000,
      });
      now += DAY_MS + 1; // the access token expired too: log in again
      expect((await deposit(40_000_000, (await login()).token)).status).toBe(201);
    });

    it('validates the body and ownership', async () => {
      const { token, wallet } = await login();
      const invalid = await fail('POST', '/deposits', {
        token,
        key: key(),
        body: { accountId: 'x', amountMinor: -5, description: 'x'.repeat(141) },
      });
      expect(invalid['errors']).toEqual([
        'accountId must be a UUID',
        'amountMinor must be a positive integer',
        'description must be shorter than or equal to 140 characters',
      ]);
      const luis = await login(LUIS);
      expect(
        await fail('POST', '/deposits', {
          token: luis.token,
          key: key(),
          body: { accountId: wallet.id, amountMinor: 100 },
        }),
      ).toMatchObject({ status: 404, code: 'ACCOUNT_NOT_FOUND' });
      void token;
    });
  });

  describe('transfers and lookup', () => {
    beforeEach(() => configure());

    it('looks up recipients by number or alias with masked data', async () => {
      const { token } = await login();
      const byNumber = await call<AccountLookup>('GET', '/accounts/lookup', {
        token,
        params: { number: '1000-0000-0002' },
      });
      expect(byNumber.body).toEqual({
        holderName: 'Luis A***',
        accountNumber: '****0002',
        alias: 'luis',
        currency: 'COP',
      });
      const byAlias = await call<AccountLookup>('GET', '/accounts/lookup', {
        token,
        params: { alias: 'VALE' },
      });
      expect(byAlias.body!.holderName).toBe('Valentina R***');
      expect(
        await fail('GET', '/accounts/lookup', { token, params: { alias: 'nadie' } }),
      ).toMatchObject({ status: 404, code: 'ACCOUNT_NOT_FOUND' });
      expect(
        await fail('GET', '/accounts/lookup', { token, params: { alias: 'a', number: 'b' } }),
      ).toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
    });

    it('moves money once per key and shows it on both sides', async () => {
      const ana = await login(ANA);
      const k = key();
      const body = {
        fromAccountId: ana.wallet.id,
        toAlias: 'luis',
        amountMinor: 2_500_000,
        description: ' Almuerzo ',
      };
      const res = await call<Transfer>('POST', '/transfers', { token: ana.token, key: k, body });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        status: 'COMPLETED',
        recipient: { holderName: 'Luis A***', accountNumber: '****0002' },
        amountMinor: 2_500_000,
        description: 'Almuerzo',
        balanceAfterMinor: 136_000_000,
      });
      const replay = await call<Transfer>('POST', '/transfers', { token: ana.token, key: k, body });
      expect(replay.body).toEqual(res.body);
      expect(replay.headers.get('Idempotent-Replayed')).toBe('true');

      const luis = await login(LUIS);
      expect(luis.wallet.balanceMinor).toBe(stored().accounts[1].balanceMinor);
      const page = await call<TransactionPage>('GET', `/accounts/${luis.wallet.id}/transactions`, {
        token: luis.token,
        params: { limit: '1' },
      });
      expect(page.body!.items[0]).toMatchObject({
        type: 'TRANSFER',
        direction: 'IN',
        amountMinor: 2_500_000,
        description: 'Almuerzo',
        counterparty: { holderName: 'Ana M***', accountNumber: '****0001' },
        transferId: res.body!.id,
      });
    });

    it('returns the API business errors', async () => {
      const { token, wallet } = await login();
      const send = (body: Record<string, unknown>, k = key()) =>
        fail('POST', '/transfers', {
          token,
          key: k,
          body: { fromAccountId: wallet.id, amountMinor: 100, ...body },
        });
      expect(await send({ toAccountNumber: '1000-0000-0999' })).toMatchObject({
        status: 404,
        code: 'RECIPIENT_NOT_FOUND',
      });
      expect(await send({ toAlias: 'ana' })).toMatchObject({
        status: 422,
        code: 'SAME_ACCOUNT_TRANSFER',
      });
      expect(await send({ toAlias: 'luis', amountMinor: 500_000_001 })).toMatchObject({
        status: 422,
        code: 'TRANSFER_LIMIT_EXCEEDED',
        maxAmountMinor: 500_000_000,
      });
      expect(await send({ toAlias: 'luis', toAccountNumber: '1000-0000-0002' })).toMatchObject({
        status: 400,
        code: 'VALIDATION_FAILED',
      });

      // Failures are not stored: the same key works once there is money.
      const k = key();
      expect(await send({ toAlias: 'luis', amountMinor: 200_000_000 }, k)).toMatchObject({
        status: 422,
        code: 'INSUFFICIENT_FUNDS',
      });
      await call('POST', '/deposits', {
        token,
        key: key(),
        body: { accountId: wallet.id, amountMinor: 70_000_000 },
      });
      const ok = await call<Transfer>('POST', '/transfers', {
        token,
        key: k,
        body: { fromAccountId: wallet.id, toAlias: 'luis', amountMinor: 200_000_000 },
      });
      expect(ok.body!.balanceAfterMinor).toBe(8_500_000);
    });

    it('enforces the rolling 24 h transfer limit', async () => {
      // Fund Ana with 21 daily deposits ($ 1.000.000 each), then send 4 × $ 5.000.000.
      let session = await login();
      for (let day = 0; day < 21; day++) {
        now += DAY_MS + 1;
        session = await login();
        await call('POST', '/deposits', {
          token: session.token,
          key: key(),
          body: { accountId: session.wallet.id, amountMinor: 100_000_000 },
        });
      }
      const send = () =>
        call('POST', '/transfers', {
          token: session.token,
          key: key(),
          body: { fromAccountId: session.wallet.id, toAlias: 'luis', amountMinor: 500_000_000 },
        });
      for (let i = 0; i < 4; i++) await send();
      expect(
        await fail('POST', '/transfers', {
          token: session.token,
          key: key(),
          body: { fromAccountId: session.wallet.id, toAlias: 'luis', amountMinor: 1 },
        }),
      ).toMatchObject({ status: 422, code: 'DAILY_TRANSFER_LIMIT_EXCEEDED', remainingMinor: 0 });
    });
  });

  describe('history', () => {
    beforeEach(() => configure());

    const list = (token: string, accountId: string, params: Record<string, string> = {}) =>
      call<TransactionPage>('GET', `/accounts/${accountId}/transactions`, { token, params });

    it('walks every movement exactly once, newest first, with the cursor', async () => {
      const { token, wallet } = await login();
      const seen: string[] = [];
      const dates: number[] = [];
      let cursor: string | null = null;
      do {
        const page: TransactionPage = (
          await list(token, wallet.id, { limit: '4', ...(cursor ? { cursor } : {}) })
        ).body!;
        expect(page.items.length).toBeLessThanOrEqual(4);
        seen.push(...page.items.map((t) => t.id));
        dates.push(...page.items.map((t) => Date.parse(t.createdAt)));
        cursor = page.nextCursor;
      } while (cursor);
      expect(seen).toHaveLength(13);
      expect(new Set(seen).size).toBe(13);
      expect([...dates].sort((a, b) => b - a)).toEqual(dates);
      expect((await list(token, wallet.id)).body!.items).toHaveLength(13); // default limit 20
    });

    it('filters by type, direction, amount and date range', async () => {
      const { token, wallet } = await login();
      const items = async (params: Record<string, string>) =>
        (await list(token, wallet.id, params)).body!.items;

      expect((await items({ type: 'DEPOSIT' })).every((t) => t.type === 'DEPOSIT')).toBe(true);
      expect(await items({ type: 'DEPOSIT' })).toHaveLength(3);
      const outgoing = await items({ direction: 'OUT' });
      expect(outgoing).toHaveLength(6);
      expect(outgoing.every((t) => t.direction === 'OUT' && t.counterparty !== null)).toBe(true);
      const mid = await items({ minAmountMinor: '4250000', maxAmountMinor: '12000000' });
      expect(mid.map((t) => t.amountMinor).sort((a, b) => a - b)).toEqual([
        4_250_000, 4_800_000, 6_000_000, 8_500_000, 9_500_000, 12_000_000,
      ]);
      const lastThreeDays = await items({
        from: new Date(START - 3 * DAY_MS - 12 * 3_600_000).toISOString(),
        to: new Date(START).toISOString(),
      });
      expect(lastThreeDays.map((t) => t.description)).toEqual([
        'Domicilio',
        'Parqueadero',
        'Gasolina del viaje',
      ]);
    });

    it('validates the query like the API', async () => {
      const { token, wallet } = await login();
      expect(
        await fail('GET', `/accounts/${wallet.id}/transactions`, {
          token,
          params: { sort: 'asc' },
        }),
      ).toMatchObject({ status: 400, errors: ['property sort should not exist'] });
      expect(
        await fail('GET', `/accounts/${wallet.id}/transactions`, {
          token,
          params: { limit: '101' },
        }),
      ).toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
      expect(
        await fail('GET', `/accounts/${wallet.id}/transactions`, {
          token,
          params: { minAmountMinor: '10', maxAmountMinor: '5' },
        }),
      ).toMatchObject({ errors: ['minAmountMinor must not exceed maxAmountMinor'] });
      expect(
        await fail('GET', `/accounts/${wallet.id}/transactions`, {
          token,
          params: { cursor: 'not-a-cursor' },
        }),
      ).toMatchObject({ status: 400, code: 'INVALID_CURSOR' });

      const luis = await login(LUIS);
      expect(
        await fail('GET', `/accounts/${wallet.id}/transactions`, { token: luis.token }),
      ).toMatchObject({ status: 404, code: 'ACCOUNT_NOT_FOUND' });
      expect(await fail('GET', '/nope', { token: luis.token })).toMatchObject({
        status: 404,
        code: 'NOT_FOUND',
      });
    });
  });

  describe('with the real client stack', () => {
    beforeEach(() => configure(true));

    it('authInterceptor refreshes an expired token against the demo backend', async () => {
      const auth = TestBed.inject(AuthService);
      await firstValueFrom(auth.login({ email: ANA.email, password: ANA.password }));
      const before = auth.accessToken();
      now += 20 * 60 * 1000; // access token expired, session still valid

      const accounts = await firstValueFrom(TestBed.inject(WalletApi).accounts());
      expect(accounts[0].balanceMinor).toBe(138_500_000);
      expect(auth.accessToken()).not.toBe(before);
    });
  });
});
