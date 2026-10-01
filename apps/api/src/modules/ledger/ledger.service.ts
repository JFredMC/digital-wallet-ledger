import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { Account } from '../accounts/entities/account.entity';
import { JournalEntry, type JournalType } from './entities/journal-entry.entity';
import { LedgerEntry, type EntryDirection } from './entities/ledger-entry.entity';
import { assertBalancedJournal, computePostings, type JournalLine } from './ledger.rules';

export interface PostJournalInput {
  type: JournalType;
  description?: string | null;
  lines: JournalLine[];
}

export interface PostedJournal {
  journalEntryId: string;
  type: JournalType;
  description: string | null;
  createdAt: Date;
  entries: LedgerEntry[];
}

export interface BalanceMismatch {
  accountId: string;
  balanceMinor: bigint;
  ledgerBalanceMinor: bigint;
}

/**
 * The ONLY writer of journal_entries / ledger_entries and of account balances.
 * Callers pass the EntityManager of their own transaction so the posting is
 * atomic with the rest of the use case (transfer, deposit, ...).
 */
@Injectable()
export class LedgerService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Locks the accounts with SELECT … FOR UPDATE in a deterministic order (by id),
   * so concurrent postings touching the same accounts can't deadlock.
   * Must run inside a transaction.
   */
  async lockAccounts(manager: EntityManager, accountIds: string[]): Promise<Map<string, Account>> {
    const ids = [...new Set(accountIds)].sort();
    const accounts = await manager.find(Account, {
      where: { id: In(ids) },
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
    return new Map(accounts.map((account) => [account.id, account]));
  }

  async post(manager: EntityManager, input: PostJournalInput): Promise<PostedJournal> {
    assertBalancedJournal(input.lines);
    const accounts = await this.lockAccounts(
      manager,
      input.lines.map((line) => line.accountId),
    );
    const postings = computePostings(accounts, input.lines);

    const journal = await manager.save(
      manager.create(JournalEntry, { type: input.type, description: input.description ?? null }),
    );

    for (const { account, balanceAfterMinor } of postings) {
      await manager.update(
        Account,
        { id: account.id },
        { balanceMinor: balanceAfterMinor, version: () => 'version + 1' },
      );
      account.balanceMinor = balanceAfterMinor;
    }

    const entries = await manager.save(
      postings.map(({ line, account, balanceAfterMinor }) =>
        manager.create(LedgerEntry, {
          journalEntryId: journal.id,
          accountId: account.id,
          direction: line.direction,
          amountMinor: line.amountMinor,
          currency: account.currency,
          balanceAfterMinor,
        }),
      ),
    );

    return {
      journalEntryId: journal.id,
      type: journal.type,
      description: journal.description,
      createdAt: journal.createdAt,
      entries,
    };
  }

  /** Σ of line amounts for an account, optionally filtered by journal type and time. */
  async sumPostedAmount(
    manager: EntityManager,
    filter: {
      accountId: string;
      direction: EntryDirection;
      journalType?: JournalType;
      since?: Date;
    },
  ): Promise<bigint> {
    const query = manager
      .createQueryBuilder(LedgerEntry, 'le')
      .innerJoin(JournalEntry, 'je', 'je.id = le.journal_entry_id')
      .select('COALESCE(SUM(le.amount_minor), 0)', 'total')
      .where('le.account_id = :accountId', { accountId: filter.accountId })
      .andWhere('le.direction = :direction', { direction: filter.direction });
    if (filter.journalType) query.andWhere('je.type = :type', { type: filter.journalType });
    if (filter.since) query.andWhere('le.created_at >= :since', { since: filter.since });

    const row = await query.getRawOne<{ total: string }>();
    return BigInt(row?.total ?? '0');
  }

  /**
   * Reconciliation: accounts whose materialized balance differs from
   * Σ CREDIT − Σ DEBIT in the ledger. Should always be empty.
   */
  async findBalanceMismatches(
    manager: EntityManager = this.dataSource.manager,
  ): Promise<BalanceMismatch[]> {
    const rows = await manager.query<
      { account_id: string; balance_minor: string; ledger_balance_minor: string }[]
    >(`
      SELECT a.id AS account_id,
             a.balance_minor,
             COALESCE(SUM(CASE le.direction WHEN 'CREDIT' THEN le.amount_minor
                                            ELSE -le.amount_minor END), 0) AS ledger_balance_minor
        FROM accounts a
        LEFT JOIN ledger_entries le ON le.account_id = a.id
       GROUP BY a.id, a.balance_minor
      HAVING a.balance_minor <> COALESCE(SUM(CASE le.direction WHEN 'CREDIT' THEN le.amount_minor
                                                               ELSE -le.amount_minor END), 0)
    `);
    return rows.map((row) => ({
      accountId: row.account_id,
      balanceMinor: BigInt(row.balance_minor),
      ledgerBalanceMinor: BigInt(row.ledger_balance_minor),
    }));
  }
}
