import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { DomainError } from '../../common/errors/domain-error';
import { fromJsonAmount, toJsonAmount } from '../../common/money/money';
import type { Env } from '../../config/env.schema';
import { AccountsService } from '../accounts/accounts.service';
import { LedgerService } from '../ledger/ledger.service';
import type { CreateDepositDto } from './dto/create-deposit.dto';
import type { DepositDto } from './dto/deposit.dto';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DESCRIPTION = 'Demo top-up';

/**
 * Sandbox top-up: moves (fictitious) money from SYSTEM_FUNDING into the
 * user's wallet through a regular two-line journal entry.
 */
@Injectable()
export class DepositsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly accounts: AccountsService,
    private readonly ledger: LedgerService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async deposit(userId: string, dto: CreateDepositDto): Promise<DepositDto> {
    if (!this.config.get('DEMO_DEPOSITS_ENABLED', { infer: true })) {
      throw new DomainError('DEPOSITS_DISABLED', 'Demo deposits are disabled.');
    }
    const amount = fromJsonAmount(dto.amountMinor);
    const dailyLimit = BigInt(this.config.get('DEMO_DEPOSIT_DAILY_LIMIT_MINOR', { infer: true }));
    const description = dto.description || DEFAULT_DESCRIPTION;

    return this.dataSource.transaction(async (manager) => {
      const wallet = await this.accounts.getOwned(userId, dto.accountId, manager);
      const funding = await this.accounts.getSystemAccount(
        manager,
        'SYSTEM_FUNDING',
        wallet.currency,
      );

      // Lock first, then check the limit: concurrent deposits to the same wallet
      // are serialized, so they can't jointly exceed the daily limit.
      await this.ledger.lockAccounts(manager, [wallet.id, funding.id]);
      const depositedLast24h = await this.ledger.sumPostedAmount(manager, {
        accountId: wallet.id,
        direction: 'CREDIT',
        journalType: 'DEPOSIT',
        since: new Date(Date.now() - DAY_MS),
      });
      if (depositedLast24h + amount > dailyLimit) {
        const remaining = dailyLimit > depositedLast24h ? dailyLimit - depositedLast24h : 0n;
        throw new DomainError(
          'DAILY_DEPOSIT_LIMIT_EXCEEDED',
          'This deposit exceeds the 24-hour demo deposit limit.',
          { remainingMinor: toJsonAmount(remaining) },
        );
      }

      const posted = await this.ledger.post(manager, {
        type: 'DEPOSIT',
        description,
        lines: [
          { accountId: funding.id, direction: 'DEBIT', amountMinor: amount },
          { accountId: wallet.id, direction: 'CREDIT', amountMinor: amount },
        ],
      });
      const walletEntry = posted.entries.find((entry) => entry.accountId === wallet.id)!;

      return {
        id: posted.journalEntryId,
        accountId: wallet.id,
        amountMinor: toJsonAmount(amount),
        currency: wallet.currency,
        balanceAfterMinor: toJsonAmount(walletEntry.balanceAfterMinor),
        description,
        createdAt: posted.createdAt.toISOString(),
      };
    });
  }
}
