import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { bigintTransformer } from '../../../common/money/money';

/** Business view of a P2P transfer; the money movement itself is its journal entry. */
@Entity({ name: 'transfers' })
export class Transfer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'journal_entry_id', type: 'uuid' })
  journalEntryId!: string;

  @Column({ name: 'from_account_id', type: 'uuid' })
  fromAccountId!: string;

  @Column({ name: 'to_account_id', type: 'uuid' })
  toAccountId!: string;

  @Column({ name: 'amount_minor', type: 'bigint', transformer: bigintTransformer })
  amountMinor!: bigint;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ type: 'varchar', length: 140, nullable: true })
  description!: string | null;

  @Column({ name: 'initiated_by', type: 'uuid' })
  initiatedBy!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
