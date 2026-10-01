import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { ProblemDetailsDto } from '../../common/filters/problem-details.dto';
import { ListTransactionsQueryDto } from './dto/list-transactions-query.dto';
import { TransactionPageDto } from './dto/transaction.dto';
import { TransactionsService } from './transactions.service';

@ApiTags('transactions')
@ApiBearerAuth()
@Controller('accounts/:accountId/transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get()
  @ApiOperation({
    summary: 'Account history',
    description:
      'Newest first, cursor (keyset) pagination: pass `nextCursor` back as `cursor`. ' +
      'Filters combine with AND.',
  })
  @ApiOkResponse({ type: TransactionPageDto })
  @ApiBadRequestResponse({
    type: ProblemDetailsDto,
    description: 'VALIDATION_FAILED | INVALID_CURSOR',
  })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto, description: 'UNAUTHORIZED' })
  @ApiNotFoundResponse({ type: ProblemDetailsDto, description: 'ACCOUNT_NOT_FOUND' })
  list(
    @CurrentUser() user: AuthUser,
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Query() query: ListTransactionsQueryDto,
  ): Promise<TransactionPageDto> {
    return this.transactions.list(user.id, accountId, query);
  }
}
