import type { HttpInterceptorFn } from '@angular/common/http';
import type { EnvironmentProviders, Provider } from '@angular/core';

/** Build-time switches. `ng build -c demo` swaps environment.ts for environment.demo.ts. */
export interface Environment {
  /** true: an in-browser mock backend answers /api/v1 (GitHub Pages demo). */
  demo: boolean;
  /** Extra interceptors, after authInterceptor (the demo backend is the last one). */
  httpInterceptors: HttpInterceptorFn[];
  providers: (Provider | EnvironmentProviders)[];
}
