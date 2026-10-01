import { BadRequestException, Body, Controller, Post, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { ProblemDetailsDto } from '../../common/filters/problem-details.dto';
import { ApiIdempotent, IdempotencyKey } from '../idempotency/idempotency-key.decorator';
import { sendIdempotent } from '../idempotency/idempotency.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { TransferDto } from './dto/transfer.dto';
import { TransfersService } from './transfers.service';

@ApiTags('transfers')
@ApiBearerAuth()
@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Post()
  @ApiOperation({
    summary: 'P2P transfer',
    description:
      'Sends money from one of your wallets to another user, identified by account number or ' +
      'alias (exactly one). Atomic and idempotent: requires `Idempotency-Key`. ' +
      'Unprocessable (422) cases: INSUFFICIENT_FUNDS, SAME_ACCOUNT_TRANSFER, ' +
      'TRANSFER_LIMIT_EXCEEDED, DAILY_TRANSFER_LIMIT_EXCEEDED, ACCOUNT_NOT_ACTIVE, ' +
      'CURRENCY_MISMATCH, IDEMPOTENCY_KEY_REUSED.',
  })
  @ApiIdempotent()
  @ApiCreatedResponse({ type: TransferDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto, description: 'UNAUTHORIZED' })
  @ApiNotFoundResponse({
    type: ProblemDetailsDto,
    description: 'ACCOUNT_NOT_FOUND (source) | RECIPIENT_NOT_FOUND',
  })
  async create(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string,
    @Body() dto: CreateTransferDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TransferDto> {
    if (!dto.toAccountNumber === !dto.toAlias) {
      throw new BadRequestException(['provide exactly one of toAccountNumber or toAlias']);
    }
    return sendIdempotent(res, await this.transfers.transfer(user.id, dto, idempotencyKey));
  }
}
