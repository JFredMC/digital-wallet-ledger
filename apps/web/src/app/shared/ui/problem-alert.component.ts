import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { AppProblem } from '../../core/http/problem';

/** Shows an API error (problem+json mapped to Spanish), optionally with "Reintentar". */
@Component({
  selector: 'app-problem-alert',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (problem(); as p) {
      <div class="alert alert-error row" role="alert" aria-live="assertive" data-testid="problem">
        <span class="spacer">{{ p.message }}</span>
        @if (p.retryable && showRetry()) {
          <button type="button" class="btn btn-ghost" (click)="retry.emit()">Reintentar</button>
        }
      </div>
    }
  `,
})
export class ProblemAlertComponent {
  readonly problem = input<AppProblem | null>(null);
  /** Show "Reintentar" for retryable problems (the parent re-sends with the same key). */
  readonly showRetry = input(false);
  readonly retry = output();
}
