import { DomainError } from '../../common/errors/domain-error';
import type { AccountStatus, AccountType } from '../accounts/entities/account.entity';
import type { EntryDirection } from './entities/ledger-entry.entity';

export interface JournalLine {
  accountId: string;
  direction: EntryDirection;
  amountMinor: bigint;
}

/** The account fields the posting rules need (a locked row in practice). */
export interface PostingAccount {
  id: string;
  type: AccountType;
  currency: string;
  status: AccountStatus;
  balanceMinor: bigint;
}

export interface Posting<A extends PostingAccount = PostingAccount> {
  line: JournalLine;
  account: A;
  balanceAfterMinor: bigint;
}

/** Effect of a line on its account, using balance = Σ CREDIT − Σ DEBIT. */
export const signedAmount = (line: Pick<JournalLine, 'direction' | 'amountMinor'>): bigint =>
  line.direction === 'CREDIT' ? line.amountMinor : -line.amountMinor;

const invariant = (detail: string) => new DomainError('LEDGER_INVARIANT_VIOLATION', detail);

/**
 * Structural double-entry rules, checked before touching the database:
 * at least two lines, strictly positive amounts, one line per account,
 * and Σ debits = Σ credits.
 */
export function assertBalancedJournal(lines: readonly JournalLine[]): void {
  if (lines.length < 2) {
    throw invariant('A journal entry needs at least two lines.');
  }
  if (lines.some((line) => line.amountMinor <= 0n)) {
    throw invariant('Every line amount must be a positive integer of minor units.');
  }
  if (new Set(lines.map((line) => line.accountId)).size !== lines.length) {
    throw invariant('An account can appear only once per journal entry.');
  }
  const net = lines.reduce((sum, line) => sum + signedAmount(line), 0n);
  if (net !== 0n) {
    throw invariant(`Journal entry is not balanced (debits − credits = ${-net}).`);
  }
}

/**
 * Applies the lines to the (locked) accounts and returns the resulting
 * balances, enforcing business rules: accounts exist and are active, share a
 * single currency, and user wallets never go below zero.
 */
export function computePostings<A extends PostingAccount>(
  accounts: ReadonlyMap<string, A>,
  lines: readonly JournalLine[],
): Posting<A>[] {
  const postings = lines.map((line) => {
    const account = accounts.get(line.accountId);
    if (!account) {
      throw new DomainError('ACCOUNT_NOT_FOUND', `Account ${line.accountId} does not exist.`);
    }
    if (account.status !== 'ACTIVE') {
      throw new DomainError('ACCOUNT_NOT_ACTIVE', `Account ${account.id} is ${account.status}.`);
    }
    return { line, account, balanceAfterMinor: account.balanceMinor + signedAmount(line) };
  });

  if (new Set(postings.map((p) => p.account.currency)).size > 1) {
    throw new DomainError('CURRENCY_MISMATCH', 'All accounts in an entry must share a currency.');
  }

  const overdrawn = postings.find(
    (p) => p.account.type === 'USER_WALLET' && p.balanceAfterMinor < 0n,
  );
  if (overdrawn) {
    throw new DomainError('INSUFFICIENT_FUNDS', 'Available balance is lower than the amount.');
  }
  return postings;
}
