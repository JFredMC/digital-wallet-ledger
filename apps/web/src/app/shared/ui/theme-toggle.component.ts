import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { ThemeService } from '../../core/theme/theme.service';

/** Botón accesible para alternar entre modo claro y oscuro. */
@Component({
  selector: 'app-theme-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.floating]': 'floating()' },
  template: `
    <button
      type="button"
      class="btn btn-ghost theme-toggle"
      data-testid="theme-toggle"
      [attr.aria-pressed]="theme.isDark()"
      [attr.aria-label]="theme.isDark() ? 'Activar modo claro' : 'Activar modo oscuro'"
      [attr.title]="theme.isDark() ? 'Modo claro' : 'Modo oscuro'"
      (click)="theme.toggle()"
    >
      @if (theme.isDark()) {
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path
            d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
          />
        </svg>
      } @else {
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      }
    </button>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    :host(.floating) {
      position: fixed;
      top: 0.75rem;
      right: 0.75rem;
      z-index: 20;
    }
    :host(.floating) .theme-toggle {
      background: var(--c-surface);
      box-shadow: var(--shadow);
    }
    .theme-toggle {
      padding: 0.45rem;
      min-width: 2.5rem;
      min-height: 2.5rem;
      border-radius: 999px;
    }
  `,
})
export class ThemeToggleComponent {
  protected readonly theme = inject(ThemeService);
  readonly floating = input(false);
}
