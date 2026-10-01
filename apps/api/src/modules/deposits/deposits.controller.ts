import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { ProblemDetailsDto } from '../../common/filters/problem-details.dto';
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
      'Limited per rolling 24 h (`DEMO_DEPOSIT_DAILY_LIMIT_MINOR`).',
  })
  @ApiCreatedResponse({ type: DepositDto })
  @ApiBadRequestResponse({ type: ProblemDetailsDto, description: 'VALIDATION_FAILED' })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto, description: 'UNAUTHORIZED' })
  @ApiForbiddenResponse({ type: ProblemDetailsDto, description: 'DEPOSITS_DISABLED' })
  @ApiNotFoundResponse({ type: ProblemDetailsDto, description: 'ACCOUNT_NOT_FOUND' })
  @ApiUnprocessableEntityResponse({
    type: ProblemDetailsDto,
    description: 'DAILY_DEPOSIT_LIMIT_EXCEEDED | ACCOUNT_NOT_ACTIVE',
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDepositDto): Promise<DepositDto> {
    return this.deposits.deposit(user.id, dto);
  }
}
