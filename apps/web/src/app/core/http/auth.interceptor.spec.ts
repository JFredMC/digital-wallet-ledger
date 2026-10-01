import { HttpClient, HttpHeaders, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { authResponse, problem, settle } from '../../../testing/fixtures';
import { AuthService } from '../auth/auth.service';
import { authInterceptor } from './auth.interceptor';

const unauthorized = { status: 401, statusText: 'Unauthorized' };

describe('authInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    vi.spyOn(auth, 'expireSession').mockImplementation(() => undefined);

    auth.login({ email: 'a@b.co', password: 'x' }).subscribe();
    backend.expectOne('/api/v1/auth/login').flush(authResponse('old'));
  });

  afterEach(() => backend.verify());

  it('adds the bearer token to API calls only', () => {
    http.get('/api/v1/accounts').subscribe();
    http.get('https://example.com/data').subscribe();
    http.post('/api/v1/auth/refresh', {}).subscribe();

    expect(backend.expectOne('/api/v1/accounts').request.headers.get('Authorization')).toBe(
      'Bearer old',
    );
    expect(backend.expectOne('https://example.com/data').request.headers.has('Authorization')).toBe(
      false,
    );
    expect(backend.expectOne('/api/v1/auth/refresh').request.headers.has('Authorization')).toBe(
      false,
    );
  });

  it('on 401 refreshes once and replays the request with the same Idempotency-Key', async () => {
    const headers = new HttpHeaders({ 'Idempotency-Key': 'key-123' });
    const result = firstValueFrom(http.post('/api/v1/transfers', { amountMinor: 1 }, { headers }));

    backend.expectOne('/api/v1/transfers').flush(problem(401, 'UNAUTHORIZED'), unauthorized);
    await settle();
    backend.expectOne('/api/v1/auth/refresh').flush(authResponse('new'));
    await settle();

    const retried = backend.expectOne('/api/v1/transfers');
    expect(retried.request.headers.get('Authorization')).toBe('Bearer new');
    expect(retried.request.headers.get('Idempotency-Key')).toBe('key-123');
    expect(retried.request.body).toEqual({ amountMinor: 1 });
    retried.flush({ id: 't-1' });

    expect(await result).toEqual({ id: 't-1' });
  });

  it('concurrent 401s share a single refresh', async () => {
    const a = firstValueFrom(http.get('/api/v1/accounts'));
    const b = firstValueFrom(http.get('/api/v1/accounts/acc-1/transactions'));

    backend.expectOne('/api/v1/accounts').flush(problem(401, 'UNAUTHORIZED'), unauthorized);
    backend
      .expectOne('/api/v1/accounts/acc-1/transactions')
      .flush(problem(401, 'UNAUTHORIZED'), unauthorized);
    await settle();

    backend.expectOne('/api/v1/auth/refresh').flush(authResponse('new'));
    await settle();
    backend.expectOne('/api/v1/accounts').flush([]);
    backend.expectOne('/api/v1/accounts/acc-1/transactions').flush({ items: [], nextCursor: null });

    await expect(a).resolves.toEqual([]);
    await expect(b).resolves.toEqual({ items: [], nextCursor: null });
  });

  it('never loops: a second 401 after the refresh is returned to the caller', async () => {
    const result = firstValueFrom(http.get('/api/v1/accounts'));
    backend.expectOne('/api/v1/accounts').flush(problem(401, 'UNAUTHORIZED'), unauthorized);
    await settle();
    backend.expectOne('/api/v1/auth/refresh').flush(authResponse('new'));
    await settle();
    backend.expectOne('/api/v1/accounts').flush(problem(401, 'UNAUTHORIZED'), unauthorized);

    await expect(result).rejects.toMatchObject({ status: 401 });
    backend.expectNone('/api/v1/auth/refresh');
  });

  it('expires the session when the refresh fails', async () => {
    const result = firstValueFrom(http.get('/api/v1/accounts'));
    backend.expectOne('/api/v1/accounts').flush(problem(401, 'UNAUTHORIZED'), unauthorized);
    await settle();
    backend
      .expectOne('/api/v1/auth/refresh')
      .flush(problem(401, 'REFRESH_TOKEN_REUSED'), unauthorized);

    await expect(result).rejects.toMatchObject({ status: 401 });
    expect(auth.expireSession).toHaveBeenCalledTimes(1);
  });

  it('does not refresh for other errors', async () => {
    const result = firstValueFrom(http.get('/api/v1/accounts'));
    backend
      .expectOne('/api/v1/accounts')
      .flush(problem(500, 'INTERNAL_ERROR'), { status: 500, statusText: 'Error' });
    await expect(result).rejects.toMatchObject({ status: 500 });
    backend.expectNone('/api/v1/auth/refresh');
  });
});
