import type { ConfigService } from '@nestjs/config';
import type { DataSource, EntityManager } from 'typeorm';
import type { AccountsService } from '../accounts/accounts.service';
import type { LedgerService } from '../ledger/ledger.service';
import { DepositsService } from './deposits.service';

const manager = {} as EntityManager;
const wallet = { id: 'wallet', currency: 'COP' };
const funding = { id: 'funding', currency: 'COP' };

function setup(env: { enabled?: boolean; limit?: number; depositedLast24h?: bigint } = {}) {
  const accounts = {
    getOwned: jest.fn().mockResolvedValue(wallet),
    getSystemAccount: jest.fn().mockResolvedValue(funding),
  };
  const ledger = {
    lockAccounts: jest.fn().mockResolvedValue(new Map()),
    sumPostedAmount: jest.fn().mockResolvedValue(env.depositedLast24h ?? 0n),
    post: jest.fn().mockResolvedValue({
      journalEntryId: 'journal-1',
      createdAt: new Date('2026-10-01T15:00:00Z'),
      entries: [
        { accountId: 'funding', balanceAfterMinor: -500n },
        { accountId: 'wallet', balanceAfterMinor: 500n },
      ],
    }),
  };
  const config = {
    get: (key: string) =>
      ({
        DEMO_DEPOSITS_ENABLED: env.enabled ?? true,
        DEMO_DEPOSIT_DAILY_LIMIT_MINOR: env.limit ?? 1000,
      })[key],
  };
  const dataSource = {
    transaction: (work: (m: EntityManager) => Promise<unknown>) => work(manager),
  };
  const service = new DepositsService(
    dataSource as unknown as DataSource,
    accounts as unknown as AccountsService,
    ledger as unknown as LedgerService,
    config as unknown as ConfigService<never, true>,
  );
  return { service, accounts, ledger };
}

describe('DepositsService', () => {
  const dto = { accountId: 'wallet', amountMinor: 500 };

  it('posts SYSTEM_FUNDING → wallet after locking both accounts', async () => {
    const { service, accounts, ledger } = setup();

    await expect(service.deposit('user-1', dto)).resolves.toEqual({
      id: 'journal-1',
      accountId: 'wallet',
      amountMinor: 500,
      currency: 'COP',
      balanceAfterMinor: 500,
      description: 'Demo top-up',
      createdAt: '2026-10-01T15:00:00.000Z',
    });
    expect(accounts.getOwned).toHaveBeenCalledWith('user-1', 'wallet', manager);
    expect(ledger.lockAccounts).toHaveBeenCalledWith(manager, ['wallet', 'funding']);
    expect(ledger.post).toHaveBeenCalledWith(manager, {
      type: 'DEPOSIT',
      description: 'Demo top-up',
      lines: [
        { accountId: 'funding', direction: 'DEBIT', amountMinor: 500n },
        { accountId: 'wallet', direction: 'CREDIT', amountMinor: 500n },
      ],
    });
    expect(ledger.lockAccounts.mock.invocationCallOrder[0]).toBeLessThan(
      ledger.sumPostedAmount.mock.invocationCallOrder[0],
    );
  });

  it('allows deposits up to exactly the daily limit', async () => {
    const { service } = setup({ limit: 1000, depositedLast24h: 500n });
    await expect(service.deposit('user-1', dto)).resolves.toBeDefined();
  });

  it('rejects deposits above the rolling daily limit and reports what is left', async () => {
    const { service, ledger } = setup({ limit: 1000, depositedLast24h: 700n });
    await expect(service.deposit('user-1', dto)).rejects.toMatchObject({
      code: 'DAILY_DEPOSIT_LIMIT_EXCEEDED',
      extensions: { remainingMinor: 300 },
    });
    expect(ledger.post).not.toHaveBeenCalled();
  });

  it('is refused when demo deposits are disabled', async () => {
    const { service, accounts } = setup({ enabled: false });
    await expect(service.deposit('user-1', dto)).rejects.toMatchObject({
      code: 'DEPOSITS_DISABLED',
    });
    expect(accounts.getOwned).not.toHaveBeenCalled();
  });
});
