import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { AccountLookup, Transfer } from '../../core/api/api.models';
import {
  type RecipientQuery,
  type TransferRequest,
  WalletApi,
} from '../../core/api/wallet-api.service';
import { type AppProblem, toProblem } from '../../core/http/problem';
import { WalletStore } from '../../core/state/wallet.store';
import { CopPipe } from '../../shared/pipes/cop.pipe';
import { IconComponent } from '../../shared/ui/icon.component';
import { ProblemAlertComponent } from '../../shared/ui/problem-alert.component';
import { formatDateTime } from '../../shared/utils/dates';
import { IdempotencyKeyTracker } from '../../shared/utils/idempotency-key';
import { parseCopInput } from '../../shared/utils/money';
import { copAmountValidator } from '../../shared/utils/validators';

type Step = 'recipient' | 'amount' | 'confirm' | 'done';
type Mode = 'number' | 'alias';

/** "100000000042" or "1000 0000 0042" → "1000-0000-0042". */
export function normalizeAccountNumber(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, '');
  return /^\d{12}$/.test(digits)
    ? `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8)}`
    : null;
}

@Component({
  selector: 'app-transfer-page',
  imports: [ReactiveFormsModule, RouterLink, CopPipe, IconComponent, ProblemAlertComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './transfer.page.html',
  styleUrl: './transfer.page.scss',
})
export class TransferPage implements OnInit {
  private readonly api = inject(WalletApi);
  protected readonly store = inject(WalletStore);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly keys = new IdempotencyKeyTracker();

  protected readonly step = signal<Step>('recipient');
  protected readonly mode = signal<Mode>('number');
  protected readonly recipient = signal<{ lookup: AccountLookup; query: RecipientQuery } | null>(
    null,
  );
  protected readonly busy = signal(false);
  protected readonly problem = signal<AppProblem | null>(null);
  protected readonly result = signal<Transfer | null>(null);

  protected readonly recipientForm = this.fb.group({
    value: ['', [Validators.required, Validators.maxLength(50)]],
  });
  protected readonly amountForm = this.fb.group({
    amount: [
      '',
      [Validators.required, copAmountValidator(() => this.store.wallet()?.balanceMinor ?? null)],
    ],
    description: ['', [Validators.maxLength(140)]],
  });

  protected readonly amountMinor = signal(0);
  protected readonly description = signal('');
  protected readonly when = computed(() => {
    const result = this.result();
    return result ? formatDateTime(result.createdAt) : '';
  });

  ngOnInit(): void {
    void this.store.ensureLoaded();
  }

  protected setMode(mode: Mode): void {
    this.mode.set(mode);
    this.recipientForm.reset();
    this.problem.set(null);
  }

  protected search(): void {
    const raw = this.recipientForm.controls.value.value.trim();
    const query = this.buildQuery(raw);
    if (!query) {
      this.recipientForm.controls.value.setErrors({ format: true });
      this.recipientForm.markAllAsTouched();
      return;
    }
    if ('number' in query && query.number === this.store.wallet()?.number) {
      this.problem.set({
        status: 422,
        code: 'SAME_ACCOUNT_TRANSFER',
        message: 'No puedes transferirte a tu misma cuenta.',
        retryable: false,
      });
      return;
    }

    this.busy.set(true);
    this.problem.set(null);
    this.api.lookup(query).subscribe({
      next: (lookup) => {
        this.recipient.set({ lookup, query });
        this.step.set('amount');
        this.busy.set(false);
      },
      error: (error: unknown) => {
        const problem = toProblem(error);
        this.problem.set(
          problem.status === 404
            ? { ...problem, message: 'No encontramos una cuenta activa con esos datos.' }
            : problem,
        );
        this.busy.set(false);
      },
    });
  }

  protected review(): void {
    this.amountForm.controls.amount.updateValueAndValidity(); // balance may have changed
    if (this.amountForm.invalid) {
      this.amountForm.markAllAsTouched();
      return;
    }
    const { amount, description } = this.amountForm.getRawValue();
    this.amountMinor.set(parseCopInput(amount)!);
    this.description.set(description.trim());
    this.problem.set(null);
    this.step.set('confirm');
  }

  /**
   * Sends the transfer. "Reintentar" calls this again with the same payload, so
   * the same Idempotency-Key is reused and the money can't move twice.
   */
  protected send(): void {
    const wallet = this.store.wallet();
    const recipient = this.recipient();
    if (!wallet || !recipient) return;

    const body: TransferRequest = {
      fromAccountId: wallet.id,
      ...('number' in recipient.query
        ? { toAccountNumber: recipient.query.number }
        : { toAlias: recipient.query.alias }),
      amountMinor: this.amountMinor(),
      ...(this.description() ? { description: this.description() } : {}),
    };
    this.busy.set(true);
    this.problem.set(null);
    this.api.transfer(body, this.keys.keyFor(body)).subscribe({
      next: (transfer) => {
        this.keys.reset();
        this.store.setBalance(transfer.balanceAfterMinor);
        this.result.set(transfer);
        this.step.set('done');
        this.busy.set(false);
      },
      error: (error: unknown) => {
        this.problem.set(toProblem(error));
        this.busy.set(false);
      },
    });
  }

  protected back(step: Step): void {
    this.problem.set(null);
    this.step.set(step);
  }

  protected restart(): void {
    this.recipientForm.reset();
    this.amountForm.reset();
    this.recipient.set(null);
    this.result.set(null);
    this.problem.set(null);
    this.step.set('recipient');
  }

  private buildQuery(raw: string): RecipientQuery | null {
    if (this.mode() === 'number') {
      const number = normalizeAccountNumber(raw);
      return number ? { number } : null;
    }
    const alias = raw.toLowerCase();
    return alias.length >= 2 && alias.length <= 50 ? { alias } : null;
  }
}
