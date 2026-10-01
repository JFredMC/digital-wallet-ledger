import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { DataSource } from 'typeorm';
import { LedgerService } from '../../src/modules/ledger/ledger.service';

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

export function deposit(
  app: INestApplication<App>,
  accessToken: string,
  accountId: string,
  amountMinor: number,
) {
  return request(app.getHttpServer())
    .post('/api/v1/deposits')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ accountId, amountMinor });
}
