import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import {
  authResponse,
  el,
  problem,
  query,
  settle,
  text,
  typeInto,
} from '../../../testing/fixtures';
import { DEMO_MODE } from '../../core/demo/demo-mode';
import { LoginPage } from './login.page';

describe('LoginPage', () => {
  let http: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  });

  afterEach(() => http.verify());

  async function render(inputs: Record<string, string> = {}) {
    const fixture = TestBed.createComponent(LoginPage);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    await fixture.whenStable();
    return fixture;
  }

  async function submit(fixture: Awaited<ReturnType<typeof render>>, email: string, pwd: string) {
    typeInto(fixture, '#email', email);
    typeInto(fixture, '#password', pwd);
    el(fixture, 'form').dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  }

  it('does not call the API with an invalid form', async () => {
    const fixture = await render();
    await submit(fixture, 'not-an-email', '');
    http.expectNone('/api/v1/auth/login');
  });

  it('shows the API error in Spanish', async () => {
    const fixture = await render();
    await submit(fixture, 'ana@example.com', 'Incorrecta1');

    http
      .expectOne('/api/v1/auth/login')
      .flush(problem(401, 'INVALID_CREDENTIALS'), { status: 401, statusText: 'Unauthorized' });
    await settle(fixture);

    expect(text(query(fixture, '[data-testid="problem"]'))).toContain(
      'Correo o contraseña incorrectos.',
    );
    expect(query(fixture, '[data-testid="problem"] button')).toBeNull(); // not retryable
  });

  it('navigates to a safe return URL after login', async () => {
    const fixture = await render({ returnUrl: '/movimientos' });
    await submit(fixture, 'ana@example.com', 'Secreta123');
    const req = http.expectOne('/api/v1/auth/login');
    expect(req.request.body).toEqual({ email: 'ana@example.com', password: 'Secreta123' });
    req.flush(authResponse());
    await settle(fixture);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/movimientos');
  });

  it('ignores external return URLs', async () => {
    const fixture = await render({ returnUrl: 'https://evil.example' });
    await submit(fixture, 'ana@example.com', 'Secreta123');
    http.expectOne('/api/v1/auth/login').flush(authResponse());
    await settle(fixture);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/inicio');
  });

  it('shows no demo hint when talking to the real API', async () => {
    const fixture = await render();
    expect(query(fixture, '[data-testid="demo-hint"]')).toBeNull();
  });

  it('explains an expired session', async () => {
    const fixture = await render({ sesion: 'expirada' });
    expect(text(fixture.nativeElement as HTMLElement)).toMatch(/sesión expiró/i);
  });

  describe('demo build', () => {
    const credentials = [
      { fullName: 'Ana María Gómez', email: 'ana@billetera.demo', password: 'Demo1234' },
      { fullName: 'Luis Alberto Pérez', email: 'luis@billetera.demo', password: 'Demo1234' },
    ];

    beforeEach(() => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [LoginPage],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideRouter([]),
          { provide: DEMO_MODE, useValue: { credentials, reset: vi.fn() } },
        ],
      });
      http = TestBed.inject(HttpTestingController);
    });

    it('lists the sample accounts and fills the form with "Usar"', async () => {
      const fixture = await render();
      const hint = query(fixture, '[data-testid="demo-hint"]');
      expect(text(hint)).toContain('Demo1234');
      expect(text(hint)).toContain('luis@billetera.demo');

      const buttons = hint!.querySelectorAll('button');
      (buttons[1] as HTMLButtonElement).click();
      await fixture.whenStable();
      expect(el<HTMLInputElement>(fixture, '#email').value).toBe('luis@billetera.demo');
      expect(el<HTMLInputElement>(fixture, '#password').value).toBe('Demo1234');
    });

    it('confirms a reset', async () => {
      const fixture = await render({ demo: 'restablecida' });
      expect(text(fixture.nativeElement as HTMLElement)).toContain(
        'la demo volvió a sus datos iniciales',
      );
    });
  });
});
