import {
  HttpErrorResponse,
  HttpHeaders,
  type HttpInterceptorFn,
  HttpResponse,
} from '@angular/common/http';
import { inject, InjectionToken } from '@angular/core';
import { delay, from, mergeMap, of, throwError } from 'rxjs';
import { API_BASE } from '../core/api/api.config';
import { DemoBackend } from './demo-backend';

/** Simulated network latency, so loading states are visible (0 in tests). */
export const DEMO_LATENCY_MS = new InjectionToken<number>('DEMO_LATENCY_MS', {
  providedIn: 'root',
  factory: () => 250,
});

/**
 * Last interceptor of the demo build: answers every /api/v1 request with
 * DemoBackend instead of the network. authInterceptor still runs before it,
 * so tokens, the single-flight refresh and retries behave as in production.
 */
export const demoBackendInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(API_BASE)) return next(req);
  const backend = inject(DemoBackend);
  const latency = inject(DEMO_LATENCY_MS);

  const url = new URL(req.urlWithParams, 'http://demo.invalid');
  const query: Record<string, string> = {};
  url.searchParams.forEach((value, key) => (query[key] = value));

  return from(
    backend.handle({
      method: req.method,
      path: url.pathname.slice(API_BASE.length) || '/',
      query,
      header: (name) => req.headers.get(name),
      body: req.body,
    }),
  ).pipe(
    delay(latency),
    mergeMap((res) => {
      const headers = new HttpHeaders(res.headers ?? {});
      if (res.status >= 400) {
        return throwError(
          () =>
            new HttpErrorResponse({
              error: res.body,
              headers,
              status: res.status,
              statusText: String((res.body as { title?: string } | null)?.title ?? 'Error'),
              url: req.url,
            }),
        );
      }
      return of(new HttpResponse({ body: res.body, headers, status: res.status, url: req.url }));
    }),
  );
};
