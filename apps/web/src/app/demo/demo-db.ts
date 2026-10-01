import { DemoError } from './demo-errors';

/**
 * The demo "database": plain JSON persisted to localStorage. Money moves only
 * through postDeposit/postTransfer, which keep balances and the per-account
 * movement log (balanceAfterMinor) consistent, like the API's ledger.
 */

export const DEMO_DB_VERSION = 1;
export const DAY_MS = 24 * 60 * 60 * 1000;

/** Same defaults as the API (.env.example). */
export const DEMO_LIMITS = {
  maxTransferMinor: 500_000_000,
  dailyTransferMinor: 2_000_000_000,
  dailyDepositMinor: 100_000_000,
  accessTokenTtlSeconds: 900,
  sessionTtlMs: 7 * DAY_MS,
  idempotencyTtlMs: DAY_MS,
} as const;

export interface DemoUser {
  id: string;
  email: string;
  fullName: string;
  role: 'USER';
  salt: string;
  passwordHash: string;
  createdAt: string;
}

export interface DemoAccount {
  id: string;
  userId: string;
  number: string;
  alias: string | null;
  type: 'USER_WALLET';
  currency: 'COP';
  balanceMinor: number;
  status: 'ACTIVE';
  createdAt: string;
}

export interface DemoMovement {
  /** Journal entry id: both sides of a transfer share it (as in the API). */
  id: string;
  /** Monotonic tie-breaker for ordering and cursors. */
  seq: number;
  accountId: string;
  type: 'DEPOSIT' | 'TRANSFER';
  direction: 'IN' | 'OUT';
  amountMinor: number;
  balanceAfterMinor: number;
  currency: 'COP';
  description: string | null;
  counterpartyAccountId: string | null;
  transferId: string | null;
  createdAt: string;
}

export interface DemoIdempotencyRecord {
  fingerprint: string;
  status: number;
  body: unknown;
  expiresAt: number;
}

/** The simulated HttpOnly refresh cookie: one session per browser. */
export interface DemoSession {
  sid: string;
  userId: string;
  expiresAt: number;
}

export interface DemoDb {
  version: typeof DEMO_DB_VERSION;
  seq: number;
  accountSeq: number;
  users: DemoUser[];
  accounts: DemoAccount[];
  movements: DemoMovement[];
  idempotency: Record<string, DemoIdempotencyRecord>;
  session: DemoSession | null;
}

export function emptyDb(): DemoDb {
  return {
    version: DEMO_DB_VERSION,
    seq: 0,
    accountSeq: 0,
    users: [],
    accounts: [],
    movements: [],
    idempotency: {},
    session: null,
  };
}

export const newId = () => crypto.randomUUID();

/** Salted PBKDF2: even in a demo, never keep plain passwords in localStorage. */
export async function hashPassword(password: string, salt: string): Promise<string> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 10_000 },
    material,
    256,
  );
  return Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function createUser(
  db: DemoDb,
  input: { email: string; fullName: string; password: string; alias?: string },
  at: number,
): Promise<{ user: DemoUser; account: DemoAccount }> {
  const salt = newId();
  const passwordHash = await hashPassword(input.password, salt);
  return insertUser(db, { ...input, salt, passwordHash }, at);
}

/** Synchronous part of registration: the user and its COP wallet. */
export function insertUser(
  db: DemoDb,
  input: { email: string; fullName: string; salt: string; passwordHash: string; alias?: string },
  at: number,
): { user: DemoUser; account: DemoAccount } {
  const createdAt = new Date(at).toISOString();
  const user: DemoUser = {
    id: newId(),
    email: input.email,
    fullName: input.fullName,
    role: 'USER',
    salt: input.salt,
    passwordHash: input.passwordHash,
    createdAt,
  };
  db.accountSeq += 1;
  const account: DemoAccount = {
    id: newId(),
    userId: user.id,
    number: `1000-0000-${String(db.accountSeq).padStart(4, '0')}`,
    alias: input.alias ?? null,
    type: 'USER_WALLET',
    currency: 'COP',
    balanceMinor: 0,
    status: 'ACTIVE',
    createdAt,
  };
  db.users.push(user);
  db.accounts.push(account);
  return { user, account };
}

function addMovement(db: DemoDb, movement: Omit<DemoMovement, 'seq'>): DemoMovement {
  db.seq += 1;
  const saved = { ...movement, seq: db.seq };
  db.movements.push(saved);
  return saved;
}

/** Sum of an account's movements of one type/direction since `since`. */
export function sumSince(
  db: DemoDb,
  accountId: string,
  type: DemoMovement['type'],
  direction: DemoMovement['direction'],
  since: number,
): number {
  return db.movements
    .filter(
      (m) =>
        m.accountId === accountId &&
        m.type === type &&
        m.direction === direction &&
        Date.parse(m.createdAt) > since,
    )
    .reduce((total, m) => total + m.amountMinor, 0);
}

export function postDeposit(
  db: DemoDb,
  account: DemoAccount,
  amountMinor: number,
  description: string,
  at: number,
): DemoMovement {
  const deposited = sumSince(db, account.id, 'DEPOSIT', 'IN', at - DAY_MS);
  if (deposited + amountMinor > DEMO_LIMITS.dailyDepositMinor) {
    throw new DemoError(
      'DAILY_DEPOSIT_LIMIT_EXCEEDED',
      'This deposit exceeds the 24-hour demo deposit limit.',
      { remainingMinor: Math.max(0, DEMO_LIMITS.dailyDepositMinor - deposited) },
    );
  }
  account.balanceMinor += amountMinor;
  return addMovement(db, {
    id: newId(),
    accountId: account.id,
    type: 'DEPOSIT',
    direction: 'IN',
    amountMinor,
    balanceAfterMinor: account.balanceMinor,
    currency: account.currency,
    description,
    counterpartyAccountId: null,
    transferId: null,
    createdAt: new Date(at).toISOString(),
  });
}

export function postTransfer(
  db: DemoDb,
  from: DemoAccount,
  to: DemoAccount,
  amountMinor: number,
  description: string | null,
  at: number,
): { transferId: string; journalEntryId: string; debit: DemoMovement } {
  if (from.id === to.id) {
    throw new DemoError('SAME_ACCOUNT_TRANSFER', 'You cannot transfer to the same account.');
  }
  const sent = sumSince(db, from.id, 'TRANSFER', 'OUT', at - DAY_MS);
  if (sent + amountMinor > DEMO_LIMITS.dailyTransferMinor) {
    throw new DemoError(
      'DAILY_TRANSFER_LIMIT_EXCEEDED',
      'This transfer exceeds your 24-hour transfer limit.',
      { remainingMinor: Math.max(0, DEMO_LIMITS.dailyTransferMinor - sent) },
    );
  }
  if (from.balanceMinor < amountMinor) {
    throw new DemoError('INSUFFICIENT_FUNDS', 'Available balance is lower than the amount.');
  }

  const journalEntryId = newId();
  const transferId = newId();
  const createdAt = new Date(at).toISOString();
  from.balanceMinor -= amountMinor;
  to.balanceMinor += amountMinor;
  const common = { id: journalEntryId, type: 'TRANSFER' as const, amountMinor, transferId };
  const debit = addMovement(db, {
    ...common,
    accountId: from.id,
    direction: 'OUT',
    balanceAfterMinor: from.balanceMinor,
    currency: from.currency,
    description,
    counterpartyAccountId: to.id,
    createdAt,
  });
  addMovement(db, {
    ...common,
    accountId: to.id,
    direction: 'IN',
    balanceAfterMinor: to.balanceMinor,
    currency: to.currency,
    description,
    counterpartyAccountId: from.id,
    createdAt,
  });
  return { transferId, journalEntryId, debit };
}

/** "Ana María Gómez" → "Ana M***"; "Ana" → "A***" (same as the API). */
export function maskHolderName(fullName: string): string {
  const [first = '', second] = fullName.trim().split(/\s+/);
  return second ? `${first} ${second.charAt(0)}***` : `${first.charAt(0)}***`;
}

/** "1000-0000-0042" → "****0042". */
export function maskAccountNumber(accountNumber: string): string {
  return `****${accountNumber.replace(/\D/g, '').slice(-4)}`;
}
