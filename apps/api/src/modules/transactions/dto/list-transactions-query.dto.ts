import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const HISTORY_TYPES = ['DEPOSIT', 'TRANSFER'] as const;
export type HistoryType = (typeof HISTORY_TYPES)[number];
export const HISTORY_DIRECTIONS = ['IN', 'OUT'] as const;
export type HistoryDirection = (typeof HISTORY_DIRECTIONS)[number];

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export class ListTransactionsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit?: number;

  @ApiPropertyOptional({ description: '`nextCursor` from the previous page (opaque)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @ApiPropertyOptional({ enum: HISTORY_TYPES })
  @IsOptional()
  @IsIn(HISTORY_TYPES)
  type?: HistoryType;

  @ApiPropertyOptional({ enum: HISTORY_DIRECTIONS, description: 'IN = money received' })
  @IsOptional()
  @IsIn(HISTORY_DIRECTIONS)
  direction?: HistoryDirection;

  @ApiPropertyOptional({ format: 'date-time', description: 'Created at or after (inclusive)' })
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'Created before (exclusive)' })
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;

  @ApiPropertyOptional({ type: 'integer', minimum: 1, description: 'Minor units, inclusive' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  minAmountMinor?: number;

  @ApiPropertyOptional({ type: 'integer', minimum: 1, description: 'Minor units, inclusive' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  maxAmountMinor?: number;
}
