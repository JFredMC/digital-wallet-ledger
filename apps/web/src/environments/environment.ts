import type { Environment } from './environment.model';

/** Default build: the SPA talks to the real NestJS API at /api/v1. */
export const environment: Environment = {
  demo: false,
  httpInterceptors: [],
  providers: [],
};
