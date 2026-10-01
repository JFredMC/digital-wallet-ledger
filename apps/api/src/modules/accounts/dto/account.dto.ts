import { ApiProperty } from '@nestjs/swagger';
import { toJsonAmount } from '../../../common/money/money';
import {
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  type Account,
  type AccountStatus,
  type AccountType,
} from '../entities/account.entity';

export class AccountDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: '1000-0000-0042' })
  number!: string;

  @ApiProperty({ type: String, nullable: true, example: null })
  alias!: string | null;

  @ApiProperty({ enum: ACCOUNT_TYPES, example: 'USER_WALLET' })
  type!: AccountType;

  @ApiProperty({ example: 'COP' })
  currency!: string;

  @ApiProperty({
    type: 'integer',
    format: 'int64',
    example: 7_500_000,
    description: 'Balance in minor units (COP centavos): 7500000 = $75.000,00',
  })
  balanceMinor!: number;

  @ApiProperty({ enum: ACCOUNT_STATUSES, example: 'ACTIVE' })
  status!: AccountStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  static fromEntity(account: Account): AccountDto {
    return {
      id: account.id,
      number: account.number,
      alias: account.alias,
      type: account.type,
      currency: account.currency,
      balanceMinor: toJsonAmount(account.balanceMinor),
      status: account.status,
      createdAt: account.createdAt.toISOString(),
    };
  }
}
