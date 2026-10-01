import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsPositive, IsString, IsUUID, Max, MaxLength } from 'class-validator';

export class CreateDepositDto {
  @ApiProperty({ format: 'uuid', description: 'Your wallet to top up' })
  @IsUUID()
  accountId!: string;

  @ApiProperty({
    type: 'integer',
    format: 'int64',
    example: 10_000_000,
    description: 'Amount in minor units (COP centavos): 10000000 = $100.000,00',
  })
  @IsInt()
  @IsPositive()
  @Max(Number.MAX_SAFE_INTEGER)
  amountMinor!: number;

  @ApiPropertyOptional({ example: 'Demo top-up', maxLength: 140 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(140)
  description?: string;
}
