import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page page-narrow">
      <div class="card stack">
        <h1>Página no encontrada</h1>
        <p class="muted">La dirección que buscas no existe.</p>
        <a routerLink="/inicio" class="btn btn-primary">Volver al inicio</a>
      </div>
    </div>
  `,
})
export class NotFoundPage {}
