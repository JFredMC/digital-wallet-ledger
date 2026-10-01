import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';
import { API_BASE, IDEMPOTENCY_KEY_HEADER } from './api.config';
import type {
  Account,
  AccountLookup,
  Deposit,
  TransactionPage,
  TransactionQuery,
  Transfer,
} from './api.models';

export interface DepositRequest {
  accountId: string;
  amountMinor: number;
  description?: string;
}

export interface TransferRequest {
  fromAccountId: string;
  toAccountNumber?: string;
  toAlias?: string;
  amountMinor: number;
  description?: string;
}

export type RecipientQuery = { number: string } | { alias: string };

/** Typed client for accounts, deposits, transfers and history. */
@Injectable({ providedIn: 'root' })
export class WalletApi {
  private readonly http = inject(HttpClient);

  accounts(): Observable<Account[]> {
    return this.http.get<Account[]>(`${API_BASE}/accounts`);
  }

  lookup(query: RecipientQuery): Observable<AccountLookup> {
    return this.http.get<AccountLookup>(`${API_BASE}/accounts/lookup`, {
      params: new HttpParams({ fromObject: query }),
    });
  }

  /** Money-moving calls always carry the caller's Idempotency-Key (reused on retries). */
  deposit(body: DepositRequest, idempotencyKey: string): Observable<Deposit> {
    return this.http.post<Deposit>(`${API_BASE}/deposits`, body, {
      headers: new HttpHeaders({ [IDEMPOTENCY_KEY_HEADER]: idempotencyKey }),
    });
  }

  transfer(body: TransferRequest, idempotencyKey: string): Observable<Transfer> {
    return this.http.post<Transfer>(`${API_BASE}/transfers`, body, {
      headers: new HttpHeaders({ [IDEMPOTENCY_KEY_HEADER]: idempotencyKey }),
    });
  }

  transactions(accountId: string, query: TransactionQuery = {}): Observable<TransactionPage> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    }
    return this.http.get<TransactionPage>(`${API_BASE}/accounts/${accountId}/transactions`, {
      params,
    });
  }
}
