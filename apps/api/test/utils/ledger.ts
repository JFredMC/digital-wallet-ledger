import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { DataSource } from 'typeorm';
import { LedgerService } from '../../src/modules/ledger/ledger.service';
import { registerUser } from './auth';

/** The two global invariants of the ledger; both must hold after every test. */
export async function expectLedgerConsistent(
  app: INestApplication<App>,
  dataSource: DataSource,
): Promise<void> {
  const [{ total }] = await dataSource.query<{ total: string }[]>(
    'SELECT COALESCE(SUM(balance_minor), 0)::text AS total FROM accounts',
  );
  expect(total).toBe('0');
  await expect(app.get(LedgerService).findBalanceMismatches()).resolves.toEqual([]);
}

export async function getWallet(app: INestApplication<App>, accessToken: string) {
  const res = await request(app.getHttpServer())
    .get('/api/v1/accounts')
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);
  return res.body[0] as { id: string; number: string; balanceMinor: number };
}

export const newIdempotencyKey = () => randomUUID();

/** POST /deposits with a fresh Idempotency-Key unless one is given. */
export function deposit(
  app: INestApplication<App>,
  accessToken: string,
  accountId: string,
  amountMinor: number,
  idempotencyKey: string = newIdempotencyKey(),
) {
  return request(app.getHttpServer())
    .post('/api/v1/deposits')
    .set('Authorization', `Bearer ${accessToken}`)
    .set('Idempotency-Key', idempotencyKey)
    .send({ accountId, amountMinor });
}

export interface TransferBody {
  fromAccountId: string;
  toAccountNumber?: string;
  toAlias?: string;
  amountMinor: number;
  description?: string;
}

/** POST /transfers with a fresh Idempotency-Key unless one is given. */
export function transfer(
  app: INestApplication<App>,
  accessToken: string,
  body: TransferBody,
  idempotencyKey: string = newIdempotencyKey(),
) {
  return request(app.getHttpServer())
    .post('/api/v1/transfers')
    .set('Authorization', `Bearer ${accessToken}`)
    .set('Idempotency-Key', idempotencyKey)
    .send(body);
}

/** A registered user whose COP wallet received a demo deposit. */
export async function fundedUser(
  app: INestApplication<App>,
  amountMinor: number,
  fullName = 'Test User',
) {
  const user = await registerUser(app, { fullName });
  const wallet = await getWallet(app, user.accessToken);
  if (amountMinor > 0) await deposit(app, user.accessToken, wallet.id, amountMinor).expect(201);
  return { ...user, wallet };
}

/**
 * Funds a wallet beyond the demo deposit limit, through the real LedgerService
 * (a balanced SYSTEM_FUNDING → wallet journal), for tests that need large balances.
 */
export async function fundDirectly(
  app: INestApplication<App>,
  dataSource: DataSource,
  walletId: string,
  amountMinor: bigint,
): Promise<void> {
  const ledger = app.get(LedgerService);
  await dataSource.transaction(async (manager) => {
    const [{ id: fundingId }] = await manager.query<{ id: string }[]>(
      `SELECT id FROM accounts WHERE type = 'SYSTEM_FUNDING' AND currency = 'COP'`,
    );
    await ledger.post(manager, {
      type: 'DEPOSIT',
      description: 'Test funding',
      lines: [
        { accountId: fundingId, direction: 'DEBIT', amountMinor },
        { accountId: walletId, direction: 'CREDIT', amountMinor },
      ],
    });
  });
}
