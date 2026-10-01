import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  catchError,
  defer,
  finalize,
  firstValueFrom,
  from,
  map,
  type Observable,
  of,
  shareReplay,
  tap,
} from 'rxjs';
import { API_BASE } from '../api/api.config';
import type { AuthResponse, User } from '../api/api.models';
import { WalletStore } from '../state/wallet.store';
import { withCrossTabLock } from './cross-tab-lock';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest extends LoginRequest {
  fullName: string;
}

/**
 * Session state. The access token lives ONLY in memory (a signal): never in
 * localStorage/sessionStorage, so an XSS can't read a persisted token. After a
 * reload the session is restored from the HttpOnly refresh cookie.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly wallet = inject(WalletStore);

  private readonly token = signal<string | null>(null);
  private readonly currentUser = signal<User | null>(null);
  private refresh$: Observable<string> | null = null;

  readonly user = this.currentUser.asReadonly();
  readonly isAuthenticated = computed(() => this.token() !== null);
  readonly firstName = computed(() => this.currentUser()?.fullName.split(/\s+/)[0] ?? '');

  accessToken(): string | null {
    return this.token();
  }

  login(body: LoginRequest): Observable<User> {
    return this.http
      .post<AuthResponse>(`${API_BASE}/auth/login`, body)
      .pipe(map((res) => this.startSession(res)));
  }

  register(body: RegisterRequest): Observable<User> {
    return this.http
      .post<AuthResponse>(`${API_BASE}/auth/register`, body)
      .pipe(map((res) => this.startSession(res)));
  }

  /**
   * Single-flight refresh: concurrent callers (e.g. several requests failing
   * with 401 at once) share ONE call to /auth/refresh, and tabs are serialized
   * with a Web Lock. Emits the new access token.
   */
  refresh(): Observable<string> {
    this.refresh$ ??= defer(() =>
      from(
        withCrossTabLock('wallet-auth-refresh', () =>
          firstValueFrom(this.http.post<AuthResponse>(`${API_BASE}/auth/refresh`, {})),
        ),
      ),
    ).pipe(
      map((res) => {
        this.startSession(res);
        return res.accessToken;
      }),
      finalize(() => (this.refresh$ = null)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.refresh$;
  }

  /** Restores the session from the refresh cookie (after a reload). Never throws. */
  restoreSession(): Promise<boolean> {
    if (this.isAuthenticated()) return Promise.resolve(true);
    return firstValueFrom(
      this.refresh().pipe(
        map(() => true),
        catchError(() => of(false)),
      ),
    );
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${API_BASE}/auth/logout`, {}).pipe(
      catchError(() => of(undefined)),
      tap(() => this.clearSession()),
      tap(() => void this.router.navigateByUrl('/ingresar')),
    );
  }

  /** The refresh failed: drop the session and send the user to log in again. */
  expireSession(returnUrl = this.router.url): void {
    this.clearSession();
    void this.router.navigate(['/ingresar'], {
      queryParams: {
        sesion: 'expirada',
        returnUrl: returnUrl.startsWith('/ingresar') ? null : returnUrl,
      },
    });
  }

  private startSession(res: AuthResponse): User {
    if (this.currentUser()?.id !== res.user.id) this.wallet.clear();
    this.token.set(res.accessToken);
    this.currentUser.set(res.user);
    return res.user;
  }

  private clearSession(): void {
    this.token.set(null);
    this.currentUser.set(null);
    this.wallet.clear(); // never show the previous user's data
  }
}
