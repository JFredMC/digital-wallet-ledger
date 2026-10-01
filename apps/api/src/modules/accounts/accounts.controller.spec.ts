import { BadRequestException } from '@nestjs/common';
import { AccountsController } from './accounts.controller';
import type { AccountsService } from './accounts.service';
import type { Account } from './entities/account.entity';

const account = {
  id: 'wallet-1',
  userId: 'user-1',
  number: '1000-0000-0042',
  alias: null,
  type: 'USER_WALLET',
  currency: 'COP',
  balanceMinor: 7_500_000n,
  status: 'ACTIVE',
  version: 3,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-01T00:00:00Z'),
} as Account;

const expectedDto = {
  id: 'wallet-1',
  number: '1000-0000-0042',
  alias: null,
  type: 'USER_WALLET',
  currency: 'COP',
  balanceMinor: 7_500_000,
  status: 'ACTIVE',
  createdAt: '2026-10-01T00:00:00.000Z',
};

describe('AccountsController', () => {
  const service = {
    listForUser: jest.fn().mockResolvedValue([account]),
    getOwned: jest.fn().mockResolvedValue(account),
    lookup: jest.fn().mockResolvedValue({ holderName: 'Ana G***' }),
  };
  const controller = new AccountsController(service as unknown as AccountsService);
  const user = { id: 'user-1', role: 'USER' as const };

  it('maps accounts to DTOs with JSON-safe integer balances', async () => {
    await expect(controller.list(user)).resolves.toEqual([expectedDto]);
    await expect(controller.get(user, 'wallet-1')).resolves.toEqual(expectedDto);
    expect(service.getOwned).toHaveBeenCalledWith('user-1', 'wallet-1');
  });

  it('requires exactly one lookup criterion', () => {
    expect(() => controller.lookup({})).toThrow(BadRequestException);
    expect(() => controller.lookup({ number: '1000-0000-0001', alias: '@a' })).toThrow(
      BadRequestException,
    );
  });

  it('delegates a valid lookup', async () => {
    await expect(controller.lookup({ alias: '@ana' })).resolves.toEqual({ holderName: 'Ana G***' });
  });
});
