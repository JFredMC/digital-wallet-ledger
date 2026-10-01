import { BadRequestException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { encodeCursor } from '../../common/pagination/cursor';
import type { AccountsService } from '../accounts/accounts.service';
import { TransactionsService } from './transactions.service';

const row = (id: number, overrides: Record<string, unknown> = {}) => ({
  entry_id: String(id),
  journal_entry_id: `journal-${id}`,
  type: 'TRANSFER',
  description: 'Lunch',
  direction: 'DEBIT',
  amount_minor: '300',
  balance_after_minor: '700',
  currency: 'COP',
  created_at: new Date('2026-10-01T15:00:00.123Z'),
  cursor_ts: '2026-10-01T15:00:00.123456Z',
  transfer_id: `transfer-${id}`,
  counterparty_number: '1000-0000-0042',
  counterparty_name: 'Luis Alberto Pérez',
  ...overrides,
});

function setup(rows: unknown[] = []) {
  const dataSource = { query: jest.fn().mockResolvedValue(rows) };
  const accounts = { getOwned: jest.fn().mockResolvedValue({ id: 'acc-a' }) };
  const service = new TransactionsService(
    dataSource as unknown as DataSource,
    accounts as unknown as AccountsService,
  );
  return { service, dataSource, accounts };
}

describe('TransactionsService', () => {
  it('checks ownership and maps rows from the account point of view', async () => {
    const { service, accounts } = setup([
      row(2),
      row(1, {
        type: 'DEPOSIT',
        direction: 'CREDIT',
        transfer_id: null,
        counterparty_number: null,
        counterparty_name: null,
      }),
    ]);

    const page = await service.list('user-1', 'acc-a', {});

    expect(accounts.getOwned).toHaveBeenCalledWith('user-1', 'acc-a');
    expect(page.nextCursor).toBeNull();
    expect(page.items).toEqual([
      {
        id: 'journal-2',
        type: 'TRANSFER',
        direction: 'OUT',
        amountMinor: 300,
        balanceAfterMinor: 700,
        currency: 'COP',
        description: 'Lunch',
        counterparty: { holderName: 'Luis A***', accountNumber: '****0042' },
        transferId: 'transfer-2',
        createdAt: '2026-10-01T15:00:00.123Z',
      },
      expect.objectContaining({ type: 'DEPOSIT', direction: 'IN', counterparty: null }),
    ]);
  });

  it('fetches one extra row to know whether there is a next page', async () => {
    const { service, dataSource } = setup([row(3), row(2), row(1)]);
    const page = await service.list('user-1', 'acc-a', { limit: 2 });

    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBe(
      encodeCursor({ createdAt: '2026-10-01T15:00:00.123456Z', id: '2' }),
    );
    const params = dataSource.query.mock.calls[0][1] as unknown[];
    expect(params.at(-1)).toBe(3);
  });

  it('translates filters and the cursor into parameterized SQL', async () => {
    const { service, dataSource } = setup();
    const cursor = encodeCursor({ createdAt: '2026-10-01T15:00:00.123456Z', id: '9' });

    await service.list('user-1', 'acc-a', {
      type: 'TRANSFER',
      direction: 'IN',
      from: '2026-09-01T00:00:00Z',
      to: '2026-10-02T00:00:00Z',
      minAmountMinor: 100,
      maxAmountMinor: 500,
      cursor,
    });

    const [sql, params] = dataSource.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('je.type = $2');
    expect(sql).toContain('le.direction = $3');
    expect(sql).toContain('le.created_at >= $4::timestamptz');
    expect(sql).toContain('le.created_at < $5::timestamptz');
    expect(sql).toContain('le.amount_minor >= $6');
    expect(sql).toContain('le.amount_minor <= $7');
    expect(sql).toContain('(le.created_at, le.id) < ($8::timestamptz, $9::bigint)');
    expect(sql).toContain('ORDER BY le.created_at DESC, le.id DESC');
    expect(params).toEqual([
      'acc-a',
      'TRANSFER',
      'CREDIT',
      '2026-09-01T00:00:00Z',
      '2026-10-02T00:00:00Z',
      100,
      500,
      '2026-10-01T15:00:00.123456Z',
      '9',
      21,
    ]);
  });

  it.each([
    [{ from: '2026-10-02T00:00:00Z', to: '2026-10-01T00:00:00Z' }],
    [{ minAmountMinor: 500, maxAmountMinor: 100 }],
  ])('rejects inverted ranges', async (query) => {
    const { service, accounts } = setup();
    await expect(service.list('user-1', 'acc-a', query)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(accounts.getOwned).not.toHaveBeenCalled();
  });

  it('rejects a malformed cursor', async () => {
    const { service } = setup();
    await expect(service.list('user-1', 'acc-a', { cursor: 'nope' })).rejects.toMatchObject({
      code: 'INVALID_CURSOR',
    });
  });
});
