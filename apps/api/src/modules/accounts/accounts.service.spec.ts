import type { EntityManager, Repository } from 'typeorm';
import type { UsersService } from '../users/users.service';
import { AccountsService } from './accounts.service';
import { Account } from './entities/account.entity';

const wallet = {
  id: 'wallet-1',
  userId: 'user-1',
  number: '1000-0000-0042',
  alias: '@luis',
  type: 'USER_WALLET',
  currency: 'COP',
  status: 'ACTIVE',
} as Account;

function setup() {
  const repo = { find: jest.fn(), findOneBy: jest.fn() };
  const users = { findById: jest.fn() };
  const service = new AccountsService(
    repo as unknown as Repository<Account>,
    users as unknown as UsersService,
  );
  return { service, repo, users };
}

describe('AccountsService', () => {
  it('opens a USER_WALLET inside the given transaction', async () => {
    const { service } = setup();
    const manager = {
      create: jest.fn((_e: unknown, data: object) => data),
      save: jest.fn((data: object) => Promise.resolve({ ...data, id: 'new' })),
    };
    await service.openWallet(manager as unknown as EntityManager, 'user-1', 'COP');
    expect(manager.create).toHaveBeenCalledWith(Account, {
      userId: 'user-1',
      type: 'USER_WALLET',
      currency: 'COP',
    });
    expect(manager.save).toHaveBeenCalled();
  });

  it('lists only the accounts of the given user', async () => {
    const { service, repo } = setup();
    repo.find.mockResolvedValue([wallet]);
    await expect(service.listForUser('user-1')).resolves.toEqual([wallet]);
    expect(repo.find).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      order: { createdAt: 'ASC' },
    });
  });

  describe('getOwned', () => {
    it('filters by owner in the query itself', async () => {
      const { service, repo } = setup();
      repo.findOneBy.mockResolvedValue(wallet);
      await expect(service.getOwned('user-1', 'wallet-1')).resolves.toBe(wallet);
      expect(repo.findOneBy).toHaveBeenCalledWith({ id: 'wallet-1', userId: 'user-1' });
    });

    it('uses the transaction manager when given one', async () => {
      const { service } = setup();
      const txRepo = { findOneBy: jest.fn().mockResolvedValue(wallet) };
      const manager = { getRepository: jest.fn().mockReturnValue(txRepo) };
      await service.getOwned('user-1', 'wallet-1', manager as unknown as EntityManager);
      expect(manager.getRepository).toHaveBeenCalledWith(Account);
    });

    it('reports a foreign or missing account as ACCOUNT_NOT_FOUND', async () => {
      const { service, repo } = setup();
      repo.findOneBy.mockResolvedValue(null);
      await expect(service.getOwned('intruder', 'wallet-1')).rejects.toMatchObject({
        code: 'ACCOUNT_NOT_FOUND',
      });
    });
  });

  describe('getSystemAccount', () => {
    it('returns the system account for the currency', async () => {
      const { service } = setup();
      const manager = { findOneBy: jest.fn().mockResolvedValue({ id: 'funding' }) };
      await expect(
        service.getSystemAccount(manager as unknown as EntityManager, 'SYSTEM_FUNDING', 'COP'),
      ).resolves.toEqual({ id: 'funding' });
    });

    it('fails loudly if the seed is missing', async () => {
      const { service } = setup();
      const manager = { findOneBy: jest.fn().mockResolvedValue(null) };
      await expect(
        service.getSystemAccount(manager as unknown as EntityManager, 'SYSTEM_FUNDING', 'COP'),
      ).rejects.toThrow(/missing/);
    });
  });

  describe('findRecipient', () => {
    it('returns the account and the full holder name, inside the transaction', async () => {
      const { service, users } = setup();
      const txRepo = { findOneBy: jest.fn().mockResolvedValue(wallet) };
      const manager = { getRepository: jest.fn().mockReturnValue(txRepo) };
      users.findById.mockResolvedValue({ fullName: 'Luis Alberto Pérez' });

      await expect(
        service.findRecipient({ alias: '@luis' }, manager as unknown as EntityManager),
      ).resolves.toEqual({ account: wallet, holderName: 'Luis Alberto Pérez' });
      // Never a second pool connection inside a transaction (pool exhaustion).
      expect(users.findById).toHaveBeenCalledWith('user-1', manager);
      expect(txRepo.findOneBy).toHaveBeenCalledWith({
        alias: '@luis',
        type: 'USER_WALLET',
        status: 'ACTIVE',
      });
    });

    it('returns null when nothing matches', async () => {
      const { service, repo } = setup();
      repo.findOneBy.mockResolvedValue(null);
      await expect(service.findRecipient({ number: '1000-0000-0999' })).resolves.toBeNull();
    });
  });

  describe('lookup', () => {
    it('returns masked recipient data for active user wallets only', async () => {
      const { service, repo, users } = setup();
      repo.findOneBy.mockResolvedValue(wallet);
      users.findById.mockResolvedValue({ fullName: 'Luis Alberto Pérez' });

      await expect(service.lookup({ number: '1000-0000-0042' })).resolves.toEqual({
        holderName: 'Luis A***',
        accountNumber: '****0042',
        alias: '@luis',
        currency: 'COP',
      });
      expect(repo.findOneBy).toHaveBeenCalledWith({
        number: '1000-0000-0042',
        type: 'USER_WALLET',
        status: 'ACTIVE',
      });
    });

    it('searches by alias', async () => {
      const { service, repo, users } = setup();
      repo.findOneBy.mockResolvedValue(wallet);
      users.findById.mockResolvedValue({ fullName: 'Luis Pérez' });
      await service.lookup({ alias: '@luis' });
      expect(repo.findOneBy).toHaveBeenCalledWith(expect.objectContaining({ alias: '@luis' }));
    });

    it('returns ACCOUNT_NOT_FOUND when nothing matches', async () => {
      const { service, repo } = setup();
      repo.findOneBy.mockResolvedValue(null);
      await expect(service.lookup({ alias: '@nobody' })).rejects.toMatchObject({
        code: 'ACCOUNT_NOT_FOUND',
      });
    });
  });
});
