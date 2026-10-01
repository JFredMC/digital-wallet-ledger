import { BadRequestException, Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
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
import { AccountsService } from './accounts.service';
import { AccountDto } from './dto/account.dto';
import { AccountLookupDto, AccountLookupQueryDto } from './dto/account-lookup.dto';

@ApiTags('accounts')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ProblemDetailsDto, description: 'UNAUTHORIZED' })
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  @ApiOperation({ summary: 'My accounts and balances' })
  @ApiOkResponse({ type: [AccountDto] })
  async list(@CurrentUser() user: AuthUser): Promise<AccountDto[]> {
    const accounts = await this.accounts.listForUser(user.id);
    return accounts.map((account) => AccountDto.fromEntity(account));
  }

  @Get('lookup')
  @ApiOperation({
    summary: 'Resolve a recipient',
    description: 'Find an active wallet by `number` or `alias` (exactly one). Data is masked.',
  })
  @ApiOkResponse({ type: AccountLookupDto })
  @ApiBadRequestResponse({ type: ProblemDetailsDto, description: 'VALIDATION_FAILED' })
  @ApiNotFoundResponse({ type: ProblemDetailsDto, description: 'ACCOUNT_NOT_FOUND' })
  lookup(@Query() query: AccountLookupQueryDto): Promise<AccountLookupDto> {
    if (!query.number === !query.alias) {
      throw new BadRequestException(['provide exactly one of number or alias']);
    }
    return this.accounts.lookup(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One of my accounts' })
  @ApiOkResponse({ type: AccountDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto, description: 'ACCOUNT_NOT_FOUND' })
  async get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AccountDto> {
    return AccountDto.fromEntity(await this.accounts.getOwned(user.id, id));
  }
}
