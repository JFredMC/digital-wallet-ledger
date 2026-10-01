import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { DomainError } from '../../common/errors/domain-error';
import type { Currency } from '../../common/money/currency';
import { UsersService } from '../users/users.service';
import type { AccountLookupDto } from './dto/account-lookup.dto';
import { Account, type SystemAccountType } from './entities/account.entity';
import { maskAccountNumber, maskHolderName } from './masking';

/** Exactly one of the two is set (validated by the caller). */
export interface RecipientQuery {
  number?: string;
  alias?: string;
}

const notFound = () => new DomainError('ACCOUNT_NOT_FOUND', 'Account not found.');

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(Account) private readonly accounts: Repository<Account>,
    private readonly users: UsersService,
  ) {}

  /** Opens the user's wallet; called inside the registration transaction. */
  openWallet(manager: EntityManager, userId: string, currency: Currency): Promise<Account> {
    return manager.save(manager.create(Account, { userId, type: 'USER_WALLET', currency }));
  }

  listForUser(userId: string): Promise<Account[]> {
    return this.accounts.find({ where: { userId }, order: { createdAt: 'ASC' } });
  }

  /**
   * Ownership is part of the query: someone else's account is reported as
   * "not found" (404), never "forbidden", so ids can't be probed (anti-BOLA).
   */
  async getOwned(userId: string, accountId: string, manager?: EntityManager): Promise<Account> {
    const repo = manager ? manager.getRepository(Account) : this.accounts;
    const account = await repo.findOneBy({ id: accountId, userId });
    if (!account) throw notFound();
    return account;
  }

  async getSystemAccount(
    manager: EntityManager,
    type: SystemAccountType,
    currency: string,
  ): Promise<Account> {
    const account = await manager.findOneBy(Account, { type, currency });
    if (!account) {
      throw new Error(`System account ${type}/${currency} is missing (migrations not applied?)`);
    }
    return account;
  }

  /**
   * Resolves a recipient by number or alias. Only active user wallets are
   * visible. Returns the full holder name: callers must mask it before
   * showing it to anyone but the owner.
   */
  async findRecipient(
    query: RecipientQuery,
    manager?: EntityManager,
  ): Promise<{ account: Account; holderName: string } | null> {
    const repo = manager ? manager.getRepository(Account) : this.accounts;
    const account = await repo.findOneBy({
      ...(query.number ? { number: query.number } : { alias: query.alias }),
      type: 'USER_WALLET',
      status: 'ACTIVE',
    });
    // Same manager as the account read: inside a transaction, borrowing a second
    // pool connection can exhaust the pool under load (every transaction holding
    // one connection while waiting for another).
    const holder = account?.userId ? await this.users.findById(account.userId, manager) : null;
    return account && holder ? { account, holderName: holder.fullName } : null;
  }

  async lookup(query: RecipientQuery): Promise<AccountLookupDto> {
    const recipient = await this.findRecipient(query);
    if (!recipient) throw notFound();
    const { account, holderName } = recipient;

    return {
      holderName: maskHolderName(holderName),
      accountNumber: maskAccountNumber(account.number),
      alias: account.alias,
      currency: account.currency,
    };
  }
}
