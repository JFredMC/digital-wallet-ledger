import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { ShellComponent } from './core/layout/shell.component';
import { ThemeToggleComponent } from './shared/ui/theme-toggle.component';

function usesShell(route: ActivatedRouteSnapshot | null): boolean {
  for (let r = route; r; r = r.firstChild) {
    if (r.routeConfig?.component === ShellComponent) return true;
  }
  return false;
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ThemeToggleComponent],
  template: `
    <router-outlet />
    @if (!inShell()) {
      <app-theme-toggle [floating]="true" />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly router = inject(Router);
  /** El shell ya trae el botón en su barra superior; fuera de él se muestra flotante. */
  protected readonly inShell = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => usesShell(this.router.routerState.snapshot.root)),
    ),
    { initialValue: true },
  );
}
