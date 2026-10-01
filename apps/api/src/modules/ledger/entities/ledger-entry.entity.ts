import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { bigintTransformer } from '../../../common/money/money';

export const ENTRY_DIRECTIONS = ['DEBIT', 'CREDIT'] as const;
export type EntryDirection = (typeof ENTRY_DIRECTIONS)[number];

/** One immutable line of a journal entry, affecting a single account. */
@Entity({ name: 'ledger_entries' })
export class LedgerEntry {
  /** BIGINT identity, kept as a string (used as a pagination tie-breaker). */
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'ALWAYS' })
  id!: string;

  @Column({ name: 'journal_entry_id', type: 'uuid' })
  journalEntryId!: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @Column({ type: 'varchar', length: 6 })
  direction!: EntryDirection;

  @Column({ name: 'amount_minor', type: 'bigint', transformer: bigintTransformer })
  amountMinor!: bigint;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ name: 'balance_after_minor', type: 'bigint', transformer: bigintTransformer })
  balanceAfterMinor!: bigint;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
