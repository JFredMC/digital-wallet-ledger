import { Body, Controller, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { ProblemDetailsDto } from '../../common/filters/problem-details.dto';
import { ApiIdempotent, IdempotencyKey } from '../idempotency/idempotency-key.decorator';
import { sendIdempotent } from '../idempotency/idempotency.service';
import { DepositsService } from './deposits.service';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { DepositDto } from './dto/deposit.dto';

@ApiTags('deposits')
@ApiBearerAuth()
@Controller('deposits')
export class DepositsController {
  constructor(private readonly deposits: DepositsService) {}

  @Post()
  @ApiOperation({
    summary: 'Simulated top-up (demo only)',
    description:
      'Moves fictitious money from SYSTEM_FUNDING into your wallet via a balanced journal entry. ' +
      'Limited per rolling 24 h (`DEMO_DEPOSIT_DAILY_LIMIT_MINOR`). Requires `Idempotency-Key`; ' +
      'unprocessable (422) cases: DAILY_DEPOSIT_LIMIT_EXCEEDED, ACCOUNT_NOT_ACTIVE.',
  })
  @ApiIdempotent()
  @ApiCreatedResponse({ type: DepositDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto, description: 'UNAUTHORIZED' })
  @ApiForbiddenResponse({ type: ProblemDetailsDto, description: 'DEPOSITS_DISABLED' })
  @ApiNotFoundResponse({ type: ProblemDetailsDto, description: 'ACCOUNT_NOT_FOUND' })
  async create(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string,
    @Body() dto: CreateDepositDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DepositDto> {
    return sendIdempotent(res, await this.deposits.deposit(user.id, dto, idempotencyKey));
  }
}
