import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JournalEntry } from './entities/journal-entry.entity';
import { LedgerEntry } from './entities/ledger-entry.entity';
import { LedgerService } from './ledger.service';

@Module({
  imports: [TypeOrmModule.forFeature([JournalEntry, LedgerEntry])],
  providers: [LedgerService],
  exports: [LedgerService],
})
export class LedgerModule {}
