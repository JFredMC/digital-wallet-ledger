import type { ConfigService } from '@nestjs/config';
import type { DataSource, EntityManager } from 'typeorm';
import type { AccountsService } from '../accounts/accounts.service';
import type { IdempotencyService } from '../idempotency/idempotency.service';
import type { LedgerService } from '../ledger/ledger.service';
import { TransfersService } from './transfers.service';

const source = { id: 'acc-a', number: '1000-0000-0001', currency: 'COP' };
const target = { id: 'acc-b', number: '1000-0000-0042', currency: 'COP' };
const createdAt = new Date('2026-10-01T15:00:00Z');

function setup(opts: { sentLast24h?: string; recipient?: unknown } = {}) {
  const manager = {
    query: jest.fn().mockResolvedValue([{ total: opts.sentLast24h ?? '0' }]),
    create: jest.fn((_entity: unknown, data: object) => data),
    save: jest.fn((data: object) => Promise.resolve({ ...data, id: 'transfer-1', createdAt })),
  };
  const accounts = {
    getOwned: jest.fn().mockResolvedValue(source),
    findRecipient: jest
      .fn()
      .mockResolvedValue(
        'recipient' in opts
          ? opts.recipient
          : { account: target, holderName: 'Luis Alberto Pérez' },
      ),
  };
  const ledger = {
    lockAccounts: jest.fn().mockResolvedValue(new Map()),
    post: jest.fn().mockResolvedValue({
      journalEntryId: 'journal-1',
      createdAt,
      entries: [
        { accountId: 'acc-a', balanceAfterMinor: 700n },
        { accountId: 'acc-b', balanceAfterMinor: 300n },
      ],
    }),
  };
  const idempotency = {
    execute: jest.fn(async (_m: EntityManager, _req: unknown, handler: () => Promise<unknown>) => ({
      status: 201,
      body: await handler(),
      replayed: false,
    })),
  };
  const config = {
    get: (key: string) => ({ MAX_TRANSFER_MINOR: 1000, DAILY_TRANSFER_LIMIT_MINOR: 2000 })[key],
  };
  const dataSource = {
    transaction: (work: (m: EntityManager) => Promise<unknown>) =>
      work(manager as unknown as EntityManager),
  };
  const service = new TransfersService(
    dataSource as unknown as DataSource,
    accounts as unknown as AccountsService,
    ledger as unknown as LedgerService,
    idempotency as unknown as IdempotencyService,
    config as unknown as ConfigService<never, true>,
  );
  return { service, manager, accounts, ledger, idempotency };
}

describe('TransfersService', () => {
  const dto = { fromAccountId: 'acc-a', toAccountNumber: '1000-0000-0042', amountMinor: 300 };

  it('posts a balanced TRANSFER journal and records the transfer, idempotently', async () => {
    const { service, manager, accounts, ledger, idempotency } = setup();

    const result = await service.transfer('user-1', dto, 'key-12345678');

    expect(idempotency.execute).toHaveBeenCalledWith(
      manager,
      { userId: 'user-1', key: 'key-12345678', scope: 'POST /transfers', payload: dto },
      expect.any(Function),
    );
    expect(accounts.getOwned).toHaveBeenCalledWith('user-1', 'acc-a', manager);
    expect(accounts.findRecipient).toHaveBeenCalledWith(
      { number: '1000-0000-0042', alias: undefined },
      manager,
    );
    expect(ledger.lockAccounts).toHaveBeenCalledWith(manager, ['acc-a', 'acc-b']);
    expect(ledger.post).toHaveBeenCalledWith(manager, {
      type: 'TRANSFER',
      description: null,
      lines: [
        { accountId: 'acc-a', direction: 'DEBIT', amountMinor: 300n },
        { accountId: 'acc-b', direction: 'CREDIT', amountMinor: 300n },
      ],
    });
    expect(manager.create).toHaveBeenCalledWith(expect.anything(), {
      journalEntryId: 'journal-1',
      fromAccountId: 'acc-a',
      toAccountId: 'acc-b',
      amountMinor: 300n,
      currency: 'COP',
      description: null,
      initiatedBy: 'user-1',
    });
    expect(result.body).toEqual({
      id: 'transfer-1',
      status: 'COMPLETED',
      journalEntryId: 'journal-1',
      fromAccountId: 'acc-a',
      recipient: { holderName: 'Luis A***', accountNumber: '****0042' },
      amountMinor: 300,
      currency: 'COP',
      description: null,
      balanceAfterMinor: 700,
      createdAt: '2026-10-01T15:00:00.000Z',
    });
  });

  it('checks the daily limit only after locking the accounts', async () => {
    const { service, manager, ledger } = setup();
    await service.transfer('user-1', dto, 'key-12345678');
    expect(ledger.lockAccounts.mock.invocationCallOrder[0]).toBeLessThan(
      manager.query.mock.invocationCallOrder[0],
    );
  });

  it('rejects amounts above the per-transfer limit before opening a transaction', async () => {
    const { service, idempotency } = setup();
    await expect(
      service.transfer('user-1', { ...dto, amountMinor: 1001 }, 'key-12345678'),
    ).rejects.toMatchObject({
      code: 'TRANSFER_LIMIT_EXCEEDED',
      extensions: { maxAmountMinor: 1000 },
    });
    expect(idempotency.execute).not.toHaveBeenCalled();
  });

  it('rejects transfers above the rolling daily limit', async () => {
    const { service, ledger } = setup({ sentLast24h: '1800' });
    await expect(service.transfer('user-1', dto, 'key-12345678')).rejects.toMatchObject({
      code: 'DAILY_TRANSFER_LIMIT_EXCEEDED',
      extensions: { remainingMinor: 200 },
    });
    expect(ledger.post).not.toHaveBeenCalled();
  });

  it('allows reaching the daily limit exactly', async () => {
    const { service } = setup({ sentLast24h: '1700' });
    await expect(service.transfer('user-1', dto, 'key-12345678')).resolves.toBeDefined();
  });

  it('reports an unknown recipient', async () => {
    const { service } = setup({ recipient: null });
    await expect(service.transfer('user-1', dto, 'key-12345678')).rejects.toMatchObject({
      code: 'RECIPIENT_NOT_FOUND',
    });
  });

  it('refuses to transfer to the same account', async () => {
    const { service, ledger } = setup({ recipient: { account: source, holderName: 'Me' } });
    await expect(service.transfer('user-1', dto, 'key-12345678')).rejects.toMatchObject({
      code: 'SAME_ACCOUNT_TRANSFER',
    });
    expect(ledger.lockAccounts).not.toHaveBeenCalled();
  });
});
