import { DomainError } from '../../common/errors/domain-error';
import {
  assertBalancedJournal,
  computePostings,
  signedAmount,
  type JournalLine,
  type PostingAccount,
} from './ledger.rules';

const debit = (accountId: string, amountMinor: bigint): JournalLine => ({
  accountId,
  direction: 'DEBIT',
  amountMinor,
});
const credit = (accountId: string, amountMinor: bigint): JournalLine => ({
  accountId,
  direction: 'CREDIT',
  amountMinor,
});

const account = (id: string, overrides: Partial<PostingAccount> = {}): PostingAccount => ({
  id,
  type: 'USER_WALLET',
  currency: 'COP',
  status: 'ACTIVE',
  balanceMinor: 0n,
  ...overrides,
});

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  return undefined;
};

describe('ledger rules', () => {
  describe('signedAmount', () => {
    it('credits increase and debits decrease a balance', () => {
      expect(signedAmount(credit('a', 5n))).toBe(5n);
      expect(signedAmount(debit('a', 5n))).toBe(-5n);
    });
  });

  describe('assertBalancedJournal', () => {
    it('accepts a balanced two-line entry', () => {
      expect(() => assertBalancedJournal([debit('a', 100n), credit('b', 100n)])).not.toThrow();
    });

    it('accepts balanced multi-line entries (e.g. amount + fee)', () => {
      expect(() =>
        assertBalancedJournal([debit('a', 105n), credit('b', 100n), credit('fees', 5n)]),
      ).not.toThrow();
    });

    it.each([
      ['a single line', [debit('a', 100n)]],
      ['unbalanced lines', [debit('a', 100n), credit('b', 99n)]],
      ['a zero amount', [debit('a', 0n), credit('b', 0n)]],
      ['a negative amount', [debit('a', -5n), credit('b', -5n)]],
      ['the same account twice', [debit('a', 5n), credit('a', 5n)]],
    ])('rejects %s', (_label, lines) => {
      expect(codeOf(() => assertBalancedJournal(lines))).toBe('LEDGER_INVARIANT_VIOLATION');
    });
  });

  describe('computePostings', () => {
    it('computes the balance after each line', () => {
      const accounts = new Map([
        ['funding', account('funding', { type: 'SYSTEM_FUNDING', balanceMinor: -500n })],
        ['wallet', account('wallet', { balanceMinor: 500n })],
      ]);
      const postings = computePostings(accounts, [debit('funding', 200n), credit('wallet', 200n)]);
      expect(postings.map((p) => [p.account.id, p.balanceAfterMinor])).toEqual([
        ['funding', -700n],
        ['wallet', 700n],
      ]);
    });

    it('lets system accounts go negative but never user wallets', () => {
      const accounts = new Map([
        ['a', account('a', { balanceMinor: 100n })],
        ['b', account('b')],
      ]);
      expect(() => computePostings(accounts, [debit('a', 100n), credit('b', 100n)])).not.toThrow();
      expect(codeOf(() => computePostings(accounts, [debit('a', 101n), credit('b', 101n)]))).toBe(
        'INSUFFICIENT_FUNDS',
      );
    });

    it('rejects unknown accounts', () => {
      const accounts = new Map([['a', account('a', { balanceMinor: 10n })]]);
      expect(codeOf(() => computePostings(accounts, [debit('a', 1n), credit('x', 1n)]))).toBe(
        'ACCOUNT_NOT_FOUND',
      );
    });

    it.each(['FROZEN', 'CLOSED'] as const)('rejects %s accounts', (status) => {
      const accounts = new Map([
        ['a', account('a', { balanceMinor: 10n })],
        ['b', account('b', { status })],
      ]);
      expect(codeOf(() => computePostings(accounts, [debit('a', 1n), credit('b', 1n)]))).toBe(
        'ACCOUNT_NOT_ACTIVE',
      );
    });

    it('rejects entries mixing currencies', () => {
      const accounts = new Map([
        ['a', account('a', { balanceMinor: 10n })],
        ['b', account('b', { currency: 'USD' })],
      ]);
      expect(codeOf(() => computePostings(accounts, [debit('a', 1n), credit('b', 1n)]))).toBe(
        'CURRENCY_MISMATCH',
      );
    });
  });
});
