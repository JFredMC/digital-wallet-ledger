import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { Deposit } from '../../core/api/api.models';
import { type DepositRequest, WalletApi } from '../../core/api/wallet-api.service';
import { type AppProblem, toProblem } from '../../core/http/problem';
import { WalletStore } from '../../core/state/wallet.store';
import { CopPipe } from '../../shared/pipes/cop.pipe';
import { ProblemAlertComponent } from '../../shared/ui/problem-alert.component';
import { IdempotencyKeyTracker } from '../../shared/utils/idempotency-key';
import { minorToInput, parseCopInput } from '../../shared/utils/money';
import { copAmountValidator } from '../../shared/utils/validators';

@Component({
  selector: 'app-deposit-page',
  imports: [ReactiveFormsModule, RouterLink, CopPipe, ProblemAlertComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './deposit.page.html',
})
export class DepositPage {
  private readonly api = inject(WalletApi);
  protected readonly store = inject(WalletStore);
  private readonly keys = new IdempotencyKeyTracker();

  protected readonly quickAmounts = [5_000_000, 10_000_000, 50_000_000];
  protected readonly form = inject(NonNullableFormBuilder).group({
    amount: ['', [Validators.required, copAmountValidator()]],
    description: ['', [Validators.maxLength(140)]],
  });
  protected readonly submitting = signal(false);
  protected readonly problem = signal<AppProblem | null>(null);
  protected readonly result = signal<Deposit | null>(null);

  protected pick(amountMinor: number): void {
    this.form.controls.amount.setValue(minorToInput(amountMinor));
    this.form.controls.amount.markAsTouched();
  }

  protected isPicked(amountMinor: number): boolean {
    return parseCopInput(this.form.controls.amount.value) === amountMinor;
  }

  /** Also used by "Reintentar": same payload → same Idempotency-Key → never credited twice. */
  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const wallet = await this.store.ensureLoaded();
    if (!wallet) return;

    const { amount, description } = this.form.getRawValue();
    const body: DepositRequest = {
      accountId: wallet.id,
      amountMinor: parseCopInput(amount)!,
      ...(description.trim() ? { description: description.trim() } : {}),
    };
    this.submitting.set(true);
    this.problem.set(null);
    this.api.deposit(body, this.keys.keyFor(body)).subscribe({
      next: (deposit) => {
        this.keys.reset();
        this.store.setBalance(deposit.balanceAfterMinor);
        this.result.set(deposit);
        this.form.reset();
        this.submitting.set(false);
      },
      error: (error: unknown) => {
        this.problem.set(toProblem(error));
        this.submitting.set(false);
      },
    });
  }

  protected another(): void {
    this.result.set(null);
  }
}
