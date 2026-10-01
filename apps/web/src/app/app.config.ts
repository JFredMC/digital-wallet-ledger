import { type ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { authInterceptor } from './core/http/auth.interceptor';

// Zoneless change detection is the default in Angular 21+ (no zone.js dependency).
// The demo build (environment.demo.ts) appends the in-browser backend interceptor;
// the default build only has authInterceptor and talks to the real API.
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(
      withFetch(),
      withInterceptors([authInterceptor, ...environment.httpInterceptors]),
    ),
    ...environment.providers,
  ],
};
