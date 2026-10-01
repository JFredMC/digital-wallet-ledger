import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { LedgerModule } from '../ledger/ledger.module';
import { DepositsController } from './deposits.controller';
import { DepositsService } from './deposits.service';

@Module({
  imports: [AccountsModule, LedgerModule, IdempotencyModule],
  controllers: [DepositsController],
  providers: [DepositsService],
})
export class DepositsModule {}
