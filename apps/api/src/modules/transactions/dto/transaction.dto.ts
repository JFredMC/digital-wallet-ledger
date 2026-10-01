import { ApiProperty } from '@nestjs/swagger';
import { JOURNAL_TYPES, type JournalType } from '../../ledger/entities/journal-entry.entity';
import { TransferPartyDto } from '../../transfers/dto/transfer.dto';
import { HISTORY_DIRECTIONS, type HistoryDirection } from './list-transactions-query.dto';

/** One movement of an account, seen from that account's side. */
export class TransactionDto {
  @ApiProperty({ format: 'uuid', description: 'Journal entry id' })
  id!: string;

  @ApiProperty({ enum: JOURNAL_TYPES, example: 'TRANSFER' })
  type!: JournalType;

  @ApiProperty({ enum: HISTORY_DIRECTIONS, example: 'OUT' })
  direction!: HistoryDirection;

  @ApiProperty({ type: 'integer', format: 'int64', example: 2_500_000 })
  amountMinor!: number;

  @ApiProperty({ type: 'integer', format: 'int64', example: 7_500_000 })
  balanceAfterMinor!: number;

  @ApiProperty({ example: 'COP' })
  currency!: string;

  @ApiProperty({ type: String, nullable: true, example: 'Lunch 🍕' })
  description!: string | null;

  @ApiProperty({
    type: TransferPartyDto,
    nullable: true,
    description: 'The other wallet of a transfer (masked); null for deposits',
  })
  counterparty!: TransferPartyDto | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  transferId!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}

export class TransactionPageDto {
  @ApiProperty({ type: [TransactionDto] })
  items!: TransactionDto[];

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Pass as `cursor` to get the next page; null on the last page',
  })
  nextCursor!: string | null;
}
