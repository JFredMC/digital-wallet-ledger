import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { DEMO_MODE } from '../../core/demo/demo-mode';

/**
 * Demo build: "Modo demo · datos simulados" + "Restablecer demo".
 * Real API build: the regular "fictional money" notice (only where `realNotice` is set).
 */
@Component({
  selector: 'app-demo-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (demo) {
      <div class="banner" [class.compact]="compact()" role="note" data-testid="demo-banner">
        <span
          ><strong>Modo demo · datos simulados</strong>
          <span class="hint">se guardan solo en este navegador</span></span
        >
        <button type="button" class="link" (click)="reset()" [disabled]="resetting()">
          {{ resetting() ? 'Restableciendo…' : 'Restablecer demo' }}
        </button>
      </div>
    } @else if (realNotice()) {
      <div class="banner">Proyecto demo · el dinero es ficticio</div>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .banner {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      align-items: center;
      gap: 0.25rem 0.75rem;
      padding: 0.35rem 1rem;
      background: var(--c-warning-50);
      color: var(--c-warning);
      font-size: 0.85rem;
      text-align: center;
    }
    .hint::before {
      content: ' · ';
    }
    .banner.compact .hint {
      display: block;
    }
    .banner.compact .hint::before {
      content: none;
    }
    .banner.compact {
      border: 1px solid #fde68a;
      border-radius: var(--radius-sm);
    }
    .link {
      padding: 0;
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      font-weight: 700;
      text-decoration: underline;
      cursor: pointer;
    }
    @media (max-width: 480px) {
      .hint {
        display: none;
      }
    }
  `,
})
export class DemoBannerComponent {
  protected readonly demo = inject(DEMO_MODE);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Rounded style for the login/register cards. */
  readonly compact = input(false);
  /** Show the generic notice when running against the real API. */
  readonly realNotice = input(false);
  protected readonly resetting = signal(false);

  protected async reset(): Promise<void> {
    const confirmed = confirm(
      '¿Restablecer la demo? Se borrarán los usuarios y movimientos creados en este navegador.',
    );
    if (!this.demo || !confirmed) return;
    this.resetting.set(true);
    await this.demo.reset();
    this.auth.logout().subscribe({
      complete: () => {
        this.resetting.set(false);
        void this.router.navigate(['/ingresar'], { queryParams: { demo: 'restablecida' } });
      },
    });
  }
}
