import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';
import { DomainError } from '../../common/errors/domain-error';
import { fromJsonAmount, toJsonAmount } from '../../common/money/money';
import type { Env } from '../../config/env.schema';
import { AccountsService } from '../accounts/accounts.service';
import { maskAccountNumber, maskHolderName } from '../accounts/masking';
import { IdempotencyService, type IdempotentResult } from '../idempotency/idempotency.service';
import { LedgerService } from '../ledger/ledger.service';
import type { CreateTransferDto } from './dto/create-transfer.dto';
import type { TransferDto } from './dto/transfer.dto';
import { Transfer } from './entities/transfer.entity';

/**
 * P2P transfer between two user wallets: one ACID transaction that claims the
 * idempotency key, locks both accounts (deterministic order, via LedgerService),
 * checks limits and funds, and posts a balanced TRANSFER journal entry.
 */
@Injectable()
export class TransfersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly accounts: AccountsService,
    private readonly ledger: LedgerService,
    private readonly idempotency: IdempotencyService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async transfer(
    userId: string,
    dto: CreateTransferDto,
    idempotencyKey: string,
  ): Promise<IdempotentResult<TransferDto>> {
    const amount = fromJsonAmount(dto.amountMinor);
    const maxAmount = BigInt(this.config.get('MAX_TRANSFER_MINOR', { infer: true }));
    if (amount > maxAmount) {
      throw new DomainError(
        'TRANSFER_LIMIT_EXCEEDED',
        'The amount exceeds the per-transfer limit.',
        {
          maxAmountMinor: toJsonAmount(maxAmount),
        },
      );
    }

    return this.dataSource.transaction((manager) =>
      this.idempotency.execute(
        manager,
        { userId, key: idempotencyKey, scope: 'POST /transfers', payload: dto },
        () => this.execute(manager, userId, dto, amount),
      ),
    );
  }

  private async execute(
    manager: EntityManager,
    userId: string,
    dto: CreateTransferDto,
    amount: bigint,
  ): Promise<TransferDto> {
    const source = await this.accounts.getOwned(userId, dto.fromAccountId, manager);
    const recipient = await this.accounts.findRecipient(
      { number: dto.toAccountNumber, alias: dto.toAlias },
      manager,
    );
    if (!recipient) {
      throw new DomainError('RECIPIENT_NOT_FOUND', 'No active wallet matches that recipient.');
    }
    const target = recipient.account;
    if (target.id === source.id) {
      throw new DomainError('SAME_ACCOUNT_TRANSFER', 'You cannot transfer to the same account.');
    }

    // Lock both wallets (sorted by id → no deadlocks between A→B and B→A), then
    // check the rolling limit: concurrent transfers from the same wallet queue
    // here, so they can't jointly exceed it. Funds are checked by post().
    await this.ledger.lockAccounts(manager, [source.id, target.id]);
    await this.assertWithinDailyLimit(manager, source.id, amount);

    const description = dto.description || null;
    const posted = await this.ledger.post(manager, {
      type: 'TRANSFER',
      description,
      lines: [
        { accountId: source.id, direction: 'DEBIT', amountMinor: amount },
        { accountId: target.id, direction: 'CREDIT', amountMinor: amount },
      ],
    });
    const transfer = await manager.save(
      manager.create(Transfer, {
        journalEntryId: posted.journalEntryId,
        fromAccountId: source.id,
        toAccountId: target.id,
        amountMinor: amount,
        currency: source.currency,
        description,
        initiatedBy: userId,
      }),
    );
    const sourceEntry = posted.entries.find((entry) => entry.accountId === source.id)!;

    return {
      id: transfer.id,
      status: 'COMPLETED',
      journalEntryId: posted.journalEntryId,
      fromAccountId: source.id,
      recipient: {
        holderName: maskHolderName(recipient.holderName),
        accountNumber: maskAccountNumber(target.number),
      },
      amountMinor: toJsonAmount(amount),
      currency: source.currency,
      description,
      balanceAfterMinor: toJsonAmount(sourceEntry.balanceAfterMinor),
      createdAt: transfer.createdAt.toISOString(),
    };
  }

  private async assertWithinDailyLimit(
    manager: EntityManager,
    accountId: string,
    amount: bigint,
  ): Promise<void> {
    const dailyLimit = BigInt(this.config.get('DAILY_TRANSFER_LIMIT_MINOR', { infer: true }));
    const [{ total }] = await manager.query<{ total: string }[]>(
      `SELECT COALESCE(SUM(amount_minor), 0)::text AS total
         FROM transfers
        WHERE from_account_id = $1 AND created_at > now() - interval '24 hours'`,
      [accountId],
    );
    const sentLast24h = BigInt(total);
    if (sentLast24h + amount > dailyLimit) {
      const remaining = dailyLimit > sentLast24h ? dailyLimit - sentLast24h : 0n;
      throw new DomainError(
        'DAILY_TRANSFER_LIMIT_EXCEEDED',
        'This transfer exceeds your 24-hour transfer limit.',
        { remainingMinor: toJsonAmount(remaining) },
      );
    }
  }
}
