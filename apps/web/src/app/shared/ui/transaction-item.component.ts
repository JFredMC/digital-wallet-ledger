import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { Transaction } from '../../core/api/api.models';
import { CopPipe } from '../pipes/cop.pipe';
import { formatDateTime } from '../utils/dates';
import { IconComponent } from './icon.component';

/** One movement, seen from the account owner's side. */
@Component({
  selector: 'app-transaction-item',
  imports: [CopPipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tx" data-testid="transaction">
      <span class="tx-icon" [class.in]="incoming()">
        <app-icon [name]="incoming() ? 'arrow-down' : 'arrow-up'" [size]="18" />
      </span>
      <div class="tx-main">
        <div class="tx-title">{{ title() }}</div>
        <div class="small muted">
          {{ when() }}
          @if (subtitle(); as s) {
            · {{ s }}
          }
        </div>
      </div>
      <div class="tx-amount">
        <div class="mono" [class.amount-in]="incoming()">
          {{ incoming() ? '+' : '−' }}{{ tx().amountMinor | cop }}
        </div>
        <div class="small muted mono tx-balance">Saldo {{ tx().balanceAfterMinor | cop }}</div>
      </div>
    </div>
  `,
  styles: `
    .tx {
      display: flex;
      align-items: center;
      gap: 0.85rem;
      padding: 0.85rem 0;
    }
    .tx-icon {
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      flex: none;
      border-radius: 12px;
      background: var(--c-surface-2);
      color: var(--c-muted);
    }
    .tx-icon.in {
      background: var(--c-success-50);
      color: var(--c-success);
    }
    .tx-main {
      flex: 1;
      min-width: 0;
    }
    .tx-title {
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .tx-amount {
      text-align: right;
      font-weight: 700;
      white-space: nowrap;
    }
    @media (max-width: 480px) {
      .tx {
        align-items: flex-start;
      }
      .tx-title {
        white-space: normal;
        overflow-wrap: anywhere;
      }
      .tx-balance {
        display: none; /* phones: keep the amount, drop the running balance */
      }
    }
  `,
})
export class TransactionItemComponent {
  readonly tx = input.required<Transaction>();

  protected readonly incoming = computed(() => this.tx().direction === 'IN');
  protected readonly when = computed(() => formatDateTime(this.tx().createdAt));
  protected readonly title = computed(() => {
    const tx = this.tx();
    if (tx.type === 'DEPOSIT') return 'Depósito de prueba';
    if (tx.type === 'TRANSFER' && tx.counterparty) {
      return tx.direction === 'IN'
        ? `Recibiste de ${tx.counterparty.holderName}`
        : `Enviaste a ${tx.counterparty.holderName}`;
    }
    return tx.type === 'FEE' ? 'Comisión' : 'Movimiento';
  });
  protected readonly subtitle = computed(() => {
    const tx = this.tx();
    return tx.type === 'DEPOSIT' && tx.description === 'Demo top-up' ? null : tx.description;
  });
}
