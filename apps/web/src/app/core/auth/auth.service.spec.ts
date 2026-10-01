import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { authResponse, problem, settle, USER, WALLET } from '../../../testing/fixtures';
import { WalletStore } from '../state/wallet.store';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let auth: AuthService;
  let http: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  });

  afterEach(() => http.verify());

  it('keeps the access token in memory only', async () => {
    const login = firstValueFrom(auth.login({ email: USER.email, password: 'Secreta123' }));
    http.expectOne({ method: 'POST', url: '/api/v1/auth/login' }).flush(authResponse('tok-1'));

    expect(await login).toEqual(USER);
    expect(auth.accessToken()).toBe('tok-1');
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.firstName()).toBe('Ana');
    const persisted = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage });
    expect(persisted).not.toContain('tok-1');
  });

  it('refresh is single-flight: concurrent callers share one request', async () => {
    const first = firstValueFrom(auth.refresh());
    const second = firstValueFrom(auth.refresh());
    await settle();

    const req = http.expectOne({ method: 'POST', url: '/api/v1/auth/refresh' });
    expect(req.request.body).toEqual({});
    req.flush(authResponse('fresh'));

    expect(await first).toBe('fresh');
    expect(await second).toBe('fresh');
    expect(auth.accessToken()).toBe('fresh');

    // Once settled, the next refresh is a new request.
    const third = firstValueFrom(auth.refresh());
    await settle();
    http.expectOne('/api/v1/auth/refresh').flush(authResponse('fresher'));
    expect(await third).toBe('fresher');
  });

  it('a failed refresh can be retried later', async () => {
    const failed = firstValueFrom(auth.refresh());
    await settle();
    http
      .expectOne('/api/v1/auth/refresh')
      .flush(problem(401, 'INVALID_REFRESH_TOKEN'), { status: 401, statusText: 'Unauthorized' });
    await expect(failed).rejects.toBeTruthy();

    const retry = firstValueFrom(auth.refresh());
    await settle();
    http.expectOne('/api/v1/auth/refresh').flush(authResponse('ok'));
    expect(await retry).toBe('ok');
  });

  it('restoreSession resolves false (never throws) without a valid cookie', async () => {
    const restored = auth.restoreSession();
    await settle();
    http
      .expectOne('/api/v1/auth/refresh')
      .flush(problem(401, 'INVALID_REFRESH_TOKEN'), { status: 401, statusText: 'Unauthorized' });
    expect(await restored).toBe(false);
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('restoreSession does not call the API when already signed in', async () => {
    auth.login({ email: USER.email, password: 'x' }).subscribe();
    http.expectOne('/api/v1/auth/login').flush(authResponse());
    expect(await auth.restoreSession()).toBe(true);
  });

  it('logout clears the session even if the API call fails', async () => {
    auth.login({ email: USER.email, password: 'x' }).subscribe();
    http.expectOne('/api/v1/auth/login').flush(authResponse());
    const store = TestBed.inject(WalletStore);
    store.load();
    http.expectOne('/api/v1/accounts').flush([WALLET]);
    await settle();
    expect(store.wallet()).not.toBeNull();

    const done = firstValueFrom(auth.logout());
    http.expectOne('/api/v1/auth/logout').error(new ProgressEvent('error'));
    await done;

    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.user()).toBeNull();
    expect(store.wallet()).toBeNull();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/ingresar');
  });

  it('expireSession sends the user to login with the return URL', () => {
    auth.expireSession('/transferir');
    expect(router.navigate).toHaveBeenCalledWith(['/ingresar'], {
      queryParams: { sesion: 'expirada', returnUrl: '/transferir' },
    });
  });
});
