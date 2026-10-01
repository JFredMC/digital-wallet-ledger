import { ApiProperty } from '@nestjs/swagger';

export class TransferPartyDto {
  @ApiProperty({ example: 'Luis P***' })
  holderName!: string;

  @ApiProperty({ example: '****0042' })
  accountNumber!: string;
}

export class TransferDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ['COMPLETED'], example: 'COMPLETED' })
  status!: 'COMPLETED';

  @ApiProperty({ format: 'uuid', description: 'Journal entry that moved the money' })
  journalEntryId!: string;

  @ApiProperty({ format: 'uuid' })
  fromAccountId!: string;

  @ApiProperty({ type: TransferPartyDto, description: 'Recipient (masked)' })
  recipient!: TransferPartyDto;

  @ApiProperty({ type: 'integer', format: 'int64', example: 2_500_000 })
  amountMinor!: number;

  @ApiProperty({ example: 'COP' })
  currency!: string;

  @ApiProperty({ type: String, nullable: true, example: 'Lunch 🍕' })
  description!: string | null;

  @ApiProperty({
    type: 'integer',
    format: 'int64',
    example: 7_500_000,
    description: 'Your balance right after this transfer',
  })
  balanceAfterMinor!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}
