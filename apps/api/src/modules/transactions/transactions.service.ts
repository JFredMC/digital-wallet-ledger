import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { decodeCursor, encodeCursor } from '../../common/pagination/cursor';
import { AccountsService } from '../accounts/accounts.service';
import { maskAccountNumber, maskHolderName } from '../accounts/masking';
import type { JournalType } from '../ledger/entities/journal-entry.entity';
import {
  DEFAULT_PAGE_SIZE,
  type ListTransactionsQueryDto,
} from './dto/list-transactions-query.dto';
import type { TransactionDto, TransactionPageDto } from './dto/transaction.dto';

interface HistoryRow {
  entry_id: string;
  journal_entry_id: string;
  type: JournalType;
  description: string | null;
  direction: 'DEBIT' | 'CREDIT';
  amount_minor: string;
  balance_after_minor: string;
  currency: string;
  created_at: Date;
  cursor_ts: string;
  transfer_id: string | null;
  counterparty_number: string | null;
  counterparty_name: string | null;
}

/** Read side: an account's movements with keyset (cursor) pagination. */
@Injectable()
export class TransactionsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly accounts: AccountsService,
  ) {}

  async list(
    userId: string,
    accountId: string,
    query: ListTransactionsQueryDto,
  ): Promise<TransactionPageDto> {
    assertRanges(query);
    await this.accounts.getOwned(userId, accountId); // 404 for anyone else's account

    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const params: unknown[] = [accountId];
    const param = (value: unknown) => `$${params.push(value)}`;
    const where = ['le.account_id = $1'];

    if (query.type) where.push(`je.type = ${param(query.type)}`);
    if (query.direction) {
      where.push(`le.direction = ${param(query.direction === 'IN' ? 'CREDIT' : 'DEBIT')}`);
    }
    if (query.from) where.push(`le.created_at >= ${param(query.from)}::timestamptz`);
    if (query.to) where.push(`le.created_at < ${param(query.to)}::timestamptz`);
    if (query.minAmountMinor) where.push(`le.amount_minor >= ${param(query.minAmountMinor)}`);
    if (query.maxAmountMinor) where.push(`le.amount_minor <= ${param(query.maxAmountMinor)}`);
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      // Row comparison matches the (account_id, created_at DESC, id DESC) index.
      where.push(
        `(le.created_at, le.id) < (${param(cursor.createdAt)}::timestamptz, ${param(cursor.id)}::bigint)`,
      );
    }

    const rows = await this.dataSource.query<HistoryRow[]>(
      `SELECT le.id::text AS entry_id,
              le.journal_entry_id,
              je.type,
              je.description,
              le.direction,
              le.amount_minor::text AS amount_minor,
              le.balance_after_minor::text AS balance_after_minor,
              le.currency,
              le.created_at,
              to_char(le.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_ts,
              t.id AS transfer_id,
              ca.number AS counterparty_number,
              cu.full_name AS counterparty_name
         FROM ledger_entries le
         JOIN journal_entries je ON je.id = le.journal_entry_id
         LEFT JOIN transfers t ON t.journal_entry_id = le.journal_entry_id
         LEFT JOIN accounts ca
                ON ca.id = CASE le.direction WHEN 'DEBIT' THEN t.to_account_id
                                             ELSE t.from_account_id END
         LEFT JOIN users cu ON cu.id = ca.user_id
        WHERE ${where.join(' AND ')}
        ORDER BY le.created_at DESC, le.id DESC
        LIMIT ${param(limit + 1)}`,
      params,
    );

    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map(toTransactionDto),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ createdAt: last.cursor_ts, id: last.entry_id })
          : null,
    };
  }
}

function assertRanges(query: ListTransactionsQueryDto): void {
  const errors: string[] = [];
  if (query.from && query.to && new Date(query.from) >= new Date(query.to)) {
    errors.push('from must be earlier than to');
  }
  if (query.minAmountMinor && query.maxAmountMinor && query.minAmountMinor > query.maxAmountMinor) {
    errors.push('minAmountMinor must not exceed maxAmountMinor');
  }
  if (errors.length > 0) throw new BadRequestException(errors);
}

function toTransactionDto(row: HistoryRow): TransactionDto {
  return {
    id: row.journal_entry_id,
    type: row.type,
    direction: row.direction === 'CREDIT' ? 'IN' : 'OUT',
    amountMinor: Number(row.amount_minor),
    balanceAfterMinor: Number(row.balance_after_minor),
    currency: row.currency,
    description: row.description,
    counterparty:
      row.counterparty_number && row.counterparty_name
        ? {
            holderName: maskHolderName(row.counterparty_name),
            accountNumber: maskAccountNumber(row.counterparty_number),
          }
        : null,
    transferId: row.transfer_id,
    createdAt: row.created_at.toISOString(),
  };
}
