import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { Transaction } from '../../core/api/api.models';
import { WalletApi } from '../../core/api/wallet-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { type AppProblem, toProblem } from '../../core/http/problem';
import { WalletStore } from '../../core/state/wallet.store';
import { CopPipe } from '../../shared/pipes/cop.pipe';
import { IconComponent } from '../../shared/ui/icon.component';
import { ProblemAlertComponent } from '../../shared/ui/problem-alert.component';
import { TransactionItemComponent } from '../../shared/ui/transaction-item.component';

@Component({
  selector: 'app-dashboard-page',
  imports: [RouterLink, CopPipe, IconComponent, ProblemAlertComponent, TransactionItemComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
})
export class DashboardPage implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly store = inject(WalletStore);
  private readonly api = inject(WalletApi);

  protected readonly recent = signal<Transaction[] | null>(null);
  protected readonly problem = signal<AppProblem | null>(null);
  protected readonly copied = signal(false);

  async ngOnInit(): Promise<void> {
    const wallet = await this.store.load(); // always fresh on the dashboard
    if (!wallet) return;
    try {
      const page = await firstValueFrom(this.api.transactions(wallet.id, { limit: 5 }));
      this.recent.set(page.items);
    } catch (error) {
      this.problem.set(toProblem(error));
      this.recent.set([]);
    }
  }

  protected async copyNumber(number: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(number);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      // Clipboard unavailable (permissions / insecure context): the number is visible anyway.
    }
  }
}
