/** Wire types of the REST API (/api/v1). Amounts are integers in minor units. */

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: 'USER' | 'ADMIN';
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: User;
}

export interface Account {
  id: string;
  number: string;
  alias: string | null;
  type: 'USER_WALLET' | 'SYSTEM_FUNDING' | 'SYSTEM_FEES';
  currency: string;
  balanceMinor: number;
  status: 'ACTIVE' | 'FROZEN' | 'CLOSED';
  createdAt: string;
}

export interface AccountLookup {
  holderName: string;
  accountNumber: string;
  alias: string | null;
  currency: string;
}

export interface Deposit {
  id: string;
  accountId: string;
  amountMinor: number;
  currency: string;
  balanceAfterMinor: number;
  description: string;
  createdAt: string;
}

export interface Party {
  holderName: string;
  accountNumber: string;
}

export interface Transfer {
  id: string;
  status: 'COMPLETED';
  journalEntryId: string;
  fromAccountId: string;
  recipient: Party;
  amountMinor: number;
  currency: string;
  description: string | null;
  balanceAfterMinor: number;
  createdAt: string;
}

export type TransactionType = 'DEPOSIT' | 'TRANSFER' | 'FEE' | 'REVERSAL';
export type Direction = 'IN' | 'OUT';

export interface Transaction {
  id: string;
  type: TransactionType;
  direction: Direction;
  amountMinor: number;
  balanceAfterMinor: number;
  currency: string;
  description: string | null;
  counterparty: Party | null;
  transferId: string | null;
  createdAt: string;
}

export interface TransactionPage {
  items: Transaction[];
  nextCursor: string | null;
}

export interface TransactionQuery {
  limit?: number;
  cursor?: string;
  type?: 'DEPOSIT' | 'TRANSFER';
  direction?: Direction;
  from?: string;
  to?: string;
  minAmountMinor?: number;
  maxAmountMinor?: number;
}

/** RFC 9457 problem details as returned by the API. */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: string;
  detail: string;
  instance?: string;
  requestId?: string;
  errors?: string[];
  [extension: string]: unknown;
}
