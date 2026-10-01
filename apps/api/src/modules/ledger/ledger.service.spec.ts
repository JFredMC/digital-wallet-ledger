import type { DataSource, EntityManager } from 'typeorm';
import { Account } from '../accounts/entities/account.entity';
import { JournalEntry } from './entities/journal-entry.entity';
import { LedgerEntry } from './entities/ledger-entry.entity';
import { LedgerService } from './ledger.service';

function account(id: string, overrides: Partial<Account> = {}): Account {
  return {
    id,
    userId: id === 'funding' ? null : `owner-${id}`,
    number: '1000-0000-0001',
    alias: null,
    type: 'USER_WALLET',
    currency: 'COP',
    balanceMinor: 0n,
    status: 'ACTIVE',
    version: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function fakeManager(accounts: Account[]) {
  const journalCreatedAt = new Date('2026-10-01T15:00:00Z');
  return {
    find: jest.fn().mockResolvedValue(accounts),
    create: jest.fn((_entity: unknown, data: object) => ({ ...data })),
    save: jest.fn((data: object | object[]) =>
      Promise.resolve(
        Array.isArray(data)
          ? data.map((row, i) => ({ ...row, id: String(i + 1) }))
          : { ...data, id: 'journal-1', createdAt: journalCreatedAt },
      ),
    ),
    update: jest.fn().mockResolvedValue(undefined),
    query: jest.fn(),
  };
}

describe('LedgerService', () => {
  const service = new LedgerService({} as DataSource);

  it('locks accounts in deterministic id order with FOR UPDATE', async () => {
    const manager = fakeManager([]);
    await service.lockAccounts(manager as unknown as EntityManager, ['b', 'a', 'b']);

    expect(manager.find).toHaveBeenCalledWith(Account, {
      where: { id: expect.objectContaining({ _value: ['a', 'b'] }) },
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
  });

  it('posts a balanced journal: header, balances and lines with balance after', async () => {
    const manager = fakeManager([
      account('funding', { type: 'SYSTEM_FUNDING', balanceMinor: -1000n }),
      account('wallet', { balanceMinor: 1000n }),
    ]);

    const posted = await service.post(manager as unknown as EntityManager, {
      type: 'DEPOSIT',
      description: 'Top-up',
      lines: [
        { accountId: 'funding', direction: 'DEBIT', amountMinor: 250n },
        { accountId: 'wallet', direction: 'CREDIT', amountMinor: 250n },
      ],
    });

    expect(manager.create).toHaveBeenCalledWith(JournalEntry, {
      type: 'DEPOSIT',
      description: 'Top-up',
    });
    expect(manager.update).toHaveBeenCalledWith(
      Account,
      { id: 'funding' },
      { balanceMinor: -1250n, version: expect.any(Function) },
    );
    expect(manager.update).toHaveBeenCalledWith(
      Account,
      { id: 'wallet' },
      { balanceMinor: 1250n, version: expect.any(Function) },
    );
    expect(manager.create).toHaveBeenCalledWith(LedgerEntry, {
      journalEntryId: 'journal-1',
      accountId: 'wallet',
      direction: 'CREDIT',
      amountMinor: 250n,
      currency: 'COP',
      balanceAfterMinor: 1250n,
    });
    expect(posted).toMatchObject({
      journalEntryId: 'journal-1',
      type: 'DEPOSIT',
      entries: [
        { accountId: 'funding', balanceAfterMinor: -1250n },
        { accountId: 'wallet', balanceAfterMinor: 1250n },
      ],
    });
  });

  it('writes nothing when the journal is unbalanced', async () => {
    const manager = fakeManager([]);
    await expect(
      service.post(manager as unknown as EntityManager, {
        type: 'DEPOSIT',
        lines: [
          { accountId: 'funding', direction: 'DEBIT', amountMinor: 250n },
          { accountId: 'wallet', direction: 'CREDIT', amountMinor: 249n },
        ],
      }),
    ).rejects.toMatchObject({ code: 'LEDGER_INVARIANT_VIOLATION' });
    expect(manager.find).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('writes nothing when a wallet would be overdrawn', async () => {
    const manager = fakeManager([account('a', { balanceMinor: 100n }), account('b')]);
    await expect(
      service.post(manager as unknown as EntityManager, {
        type: 'TRANSFER',
        lines: [
          { accountId: 'a', direction: 'DEBIT', amountMinor: 101n },
          { accountId: 'b', direction: 'CREDIT', amountMinor: 101n },
        ],
      }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('maps reconciliation rows to bigint mismatches', async () => {
    const manager = fakeManager([]);
    manager.query.mockResolvedValue([
      { account_id: 'a', balance_minor: '10', ledger_balance_minor: '7' },
    ]);
    await expect(
      service.findBalanceMismatches(manager as unknown as EntityManager),
    ).resolves.toEqual([{ accountId: 'a', balanceMinor: 10n, ledgerBalanceMinor: 7n }]);
  });
});
