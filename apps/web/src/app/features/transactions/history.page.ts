import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import type { Transaction, TransactionQuery } from '../../core/api/api.models';
import { WalletApi } from '../../core/api/wallet-api.service';
import { type AppProblem, toProblem } from '../../core/http/problem';
import { WalletStore } from '../../core/state/wallet.store';
import { ProblemAlertComponent } from '../../shared/ui/problem-alert.component';
import { TransactionItemComponent } from '../../shared/ui/transaction-item.component';
import { endOfLocalDayExclusive, startOfLocalDay } from '../../shared/utils/dates';
import { parseCopInput } from '../../shared/utils/money';
import { copAmountValidator } from '../../shared/utils/validators';

export const HISTORY_PAGE_SIZE = 10;

@Component({
  selector: 'app-history-page',
  imports: [ReactiveFormsModule, ProblemAlertComponent, TransactionItemComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './history.page.html',
  styleUrl: './history.page.scss',
})
export class HistoryPage implements OnInit {
  private readonly api = inject(WalletApi);
  private readonly store = inject(WalletStore);

  protected readonly filters = inject(NonNullableFormBuilder).group({
    type: [''],
    direction: [''],
    from: [''],
    to: [''],
    min: ['', [copAmountValidator()]],
    max: ['', [copAmountValidator()]],
  });

  protected readonly items = signal<Transaction[]>([]);
  protected readonly nextCursor = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadingMore = signal(false);
  protected readonly problem = signal<AppProblem | null>(null);
  protected readonly rangeError = signal<string | null>(null);
  private query: TransactionQuery = {};

  async ngOnInit(): Promise<void> {
    await this.fetch(false);
  }

  protected async apply(): Promise<void> {
    if (this.filters.invalid) {
      this.filters.markAllAsTouched();
      return;
    }
    const query = this.buildQuery();
    if (!query) return;
    this.query = query;
    await this.fetch(false);
  }

  protected async clear(): Promise<void> {
    this.filters.reset();
    this.rangeError.set(null);
    this.query = {};
    await this.fetch(false);
  }

  protected async loadMore(): Promise<void> {
    await this.fetch(true);
  }

  private async fetch(append: boolean): Promise<void> {
    const wallet = await this.store.ensureLoaded();
    if (!wallet) {
      this.loading.set(false);
      return;
    }
    const cursor = append ? this.nextCursor() : null;
    (append ? this.loadingMore : this.loading).set(true);
    this.problem.set(null);
    try {
      const page = await firstValueFrom(
        this.api.transactions(wallet.id, {
          ...this.query,
          limit: HISTORY_PAGE_SIZE,
          ...(cursor ? { cursor } : {}),
        }),
      );
      this.items.update((items) => (append ? [...items, ...page.items] : page.items));
      this.nextCursor.set(page.nextCursor);
    } catch (error) {
      this.problem.set(toProblem(error));
    } finally {
      this.loading.set(false);
      this.loadingMore.set(false);
    }
  }

  /** Form → API query; dates are whole local days, amounts are pesos → minor units. */
  private buildQuery(): TransactionQuery | null {
    const f = this.filters.getRawValue();
    const min = f.min ? parseCopInput(f.min) : null;
    const max = f.max ? parseCopInput(f.max) : null;
    if (f.from && f.to && f.from > f.to) {
      this.rangeError.set('La fecha inicial debe ser anterior a la final.');
      return null;
    }
    if (min !== null && max !== null && min > max) {
      this.rangeError.set('El monto mínimo no puede ser mayor que el máximo.');
      return null;
    }
    this.rangeError.set(null);
    return {
      ...(f.type ? { type: f.type as TransactionQuery['type'] } : {}),
      ...(f.direction ? { direction: f.direction as TransactionQuery['direction'] } : {}),
      ...(f.from ? { from: startOfLocalDay(f.from) } : {}),
      ...(f.to ? { to: endOfLocalDayExclusive(f.to) } : {}),
      ...(min !== null ? { minAmountMinor: min } : {}),
      ...(max !== null ? { maxAmountMinor: max } : {}),
    };
  }
}
