import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';

describe('App', () => {
  it('renders the router outlet', async () => {
    TestBed.configureTestingModule({ imports: [App], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('router-outlet')).not.toBeNull();
  });

  it('protects the private pages and uses Spanish paths', () => {
    const shell = routes.find((r) => r.path === '' && r.children);
    expect(shell?.canActivate).toHaveLength(1);
    expect(shell?.children?.map((c) => c.path)).toEqual(
      expect.arrayContaining(['inicio', 'depositar', 'transferir', 'movimientos']),
    );
    expect(routes.map((r) => r.path)).toEqual(expect.arrayContaining(['ingresar', 'registro']));
  });
});
