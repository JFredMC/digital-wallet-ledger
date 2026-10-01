import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Account } from '../api/api.models';
import { WalletApi } from '../api/wallet-api.service';
import { type AppProblem, toProblem } from '../http/problem';

/** The signed-in user's COP wallet (one per user in the MVP). */
@Injectable({ providedIn: 'root' })
export class WalletStore {
  private readonly api = inject(WalletApi);

  private readonly state = signal<{
    wallet: Account | null;
    loading: boolean;
    error: AppProblem | null;
  }>({ wallet: null, loading: false, error: null });

  readonly wallet = computed(() => this.state().wallet);
  readonly loading = computed(() => this.state().loading);
  readonly error = computed(() => this.state().error);
  readonly balanceMinor = computed(() => this.state().wallet?.balanceMinor ?? 0);

  async load(): Promise<Account | null> {
    this.state.update((s) => ({ ...s, loading: true, error: null }));
    try {
      const accounts = await firstValueFrom(this.api.accounts());
      const wallet = accounts.find((a) => a.type === 'USER_WALLET') ?? null;
      this.state.set({ wallet, loading: false, error: null });
      return wallet;
    } catch (error) {
      this.state.update((s) => ({ ...s, loading: false, error: toProblem(error) }));
      return null;
    }
  }

  /** Loads only if not loaded yet. */
  async ensureLoaded(): Promise<Account | null> {
    return this.state().wallet ?? this.load();
  }

  /** Applies the balance returned by a deposit/transfer without a round-trip. */
  setBalance(balanceMinor: number): void {
    this.state.update((s) => (s.wallet ? { ...s, wallet: { ...s.wallet, balanceMinor } } : s));
  }

  clear(): void {
    this.state.set({ wallet: null, loading: false, error: null });
  }
}
