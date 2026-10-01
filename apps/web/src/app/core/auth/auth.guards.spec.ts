import { TestBed } from '@angular/core/testing';
import {
  type ActivatedRouteSnapshot,
  provideRouter,
  Router,
  type RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { authGuard, guestGuard } from './auth.guards';
import { AuthService } from './auth.service';

describe('route guards', () => {
  const restoreSession = vi.fn<() => Promise<boolean>>();
  const route = {} as ActivatedRouteSnapshot;
  const state = { url: '/movimientos?type=DEPOSIT' } as RouterStateSnapshot;

  beforeEach(() => {
    restoreSession.mockReset();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: { restoreSession } }],
    });
  });

  const run = (guard: typeof authGuard) =>
    TestBed.runInInjectionContext(() => guard(route, state)) as Promise<boolean | UrlTree>;
  const serialize = (tree: boolean | UrlTree) =>
    TestBed.inject(Router).serializeUrl(tree as UrlTree);

  it('authGuard lets a (restored) session through', async () => {
    restoreSession.mockResolvedValue(true);
    expect(await run(authGuard)).toBe(true);
  });

  it('authGuard sends anonymous users to login with the return URL', async () => {
    restoreSession.mockResolvedValue(false);
    const result = await run(authGuard);
    expect(result).toBeInstanceOf(UrlTree);
    expect(serialize(result)).toBe('/ingresar?returnUrl=%2Fmovimientos%3Ftype%3DDEPOSIT');
  });

  it('guestGuard sends signed-in users to the dashboard', async () => {
    restoreSession.mockResolvedValue(true);
    expect(serialize(await run(guestGuard))).toBe('/inicio');
  });

  it('guestGuard lets anonymous users see login/register', async () => {
    restoreSession.mockResolvedValue(false);
    expect(await run(guestGuard)).toBe(true);
  });
});
