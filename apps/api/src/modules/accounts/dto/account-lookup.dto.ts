import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class AccountLookupQueryDto {
  @ApiPropertyOptional({ example: '1000-0000-0042', description: 'Account number' })
  @IsOptional()
  @Matches(/^\d{4}-\d{4}-\d{4}$/, { message: 'number must look like 1000-0000-0042' })
  number?: string;

  @ApiPropertyOptional({ example: '@luis', description: 'Account alias ("llave")' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @Length(2, 50)
  alias?: string;
}

/** Just enough to confirm the recipient, with personal data masked. */
export class AccountLookupDto {
  @ApiProperty({ example: 'Luis P***' })
  holderName!: string;

  @ApiProperty({ example: '****0042' })
  accountNumber!: string;

  @ApiProperty({ type: String, nullable: true, example: '@luis' })
  alias!: string | null;

  @ApiProperty({ example: 'COP' })
  currency!: string;
}
