import { ApiProperty } from '@nestjs/swagger';

export class DepositDto {
  @ApiProperty({ format: 'uuid', description: 'Journal entry id of the deposit' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  accountId!: string;

  @ApiProperty({ type: 'integer', format: 'int64', example: 10_000_000 })
  amountMinor!: number;

  @ApiProperty({ example: 'COP' })
  currency!: string;

  @ApiProperty({ type: 'integer', format: 'int64', example: 17_500_000 })
  balanceAfterMinor!: number;

  @ApiProperty({ example: 'Demo top-up' })
  description!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}
