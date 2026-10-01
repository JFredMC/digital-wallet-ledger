import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { LedgerModule } from '../ledger/ledger.module';
import { DepositsController } from './deposits.controller';
import { DepositsService } from './deposits.service';

@Module({
  imports: [AccountsModule, LedgerModule],
  controllers: [DepositsController],
  providers: [DepositsService],
})
export class DepositsModule {}
