import { DEMO_MODE } from '../app/core/demo/demo-mode';
import { DemoBackend } from '../app/demo/demo-backend';
import { demoBackendInterceptor } from '../app/demo/demo-backend.interceptor';
import type { Environment } from './environment.model';

/**
 * Demo build (GitHub Pages): /api/v1 is answered in the browser by DemoBackend,
 * persisted to localStorage. Everything else (auth interceptor, refresh,
 * Idempotency-Key handling, problem+json mapping) runs exactly as with the API.
 */
export const environment: Environment = {
  demo: true,
  httpInterceptors: [demoBackendInterceptor],
  providers: [{ provide: DEMO_MODE, useExisting: DemoBackend }],
};
