import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export const JOURNAL_TYPES = ['TRANSFER', 'DEPOSIT', 'FEE', 'REVERSAL'] as const;
export type JournalType = (typeof JOURNAL_TYPES)[number];

/** Header of an immutable, balanced accounting entry. */
@Entity({ name: 'journal_entries' })
export class JournalEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 20 })
  type!: JournalType;

  @Column({ type: 'varchar', length: 140, nullable: true })
  description!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
