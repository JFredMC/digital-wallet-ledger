import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateTransferDto {
  @ApiProperty({ format: 'uuid', description: 'Your wallet to send from' })
  @IsUUID()
  fromAccountId!: string;

  @ApiPropertyOptional({
    example: '1000-0000-0042',
    description: 'Recipient account number (exactly one of toAccountNumber / toAlias)',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{4}-\d{4}$/, { message: 'toAccountNumber must look like 1000-0000-0042' })
  toAccountNumber?: string;

  @ApiPropertyOptional({ example: '@luis', description: 'Recipient alias ("llave")' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @Length(2, 50)
  toAlias?: string;

  @ApiProperty({
    type: 'integer',
    format: 'int64',
    example: 2_500_000,
    description: 'Amount in minor units (COP centavos): 2500000 = $25.000,00',
  })
  @IsInt()
  @IsPositive()
  @Max(Number.MAX_SAFE_INTEGER)
  amountMinor!: number;

  @ApiPropertyOptional({ example: 'Lunch 🍕', maxLength: 140 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(140)
  description?: string;
}
