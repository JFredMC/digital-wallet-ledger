import { InjectionToken } from '@angular/core';

/** A sample account shown on the login screen in demo mode. */
export interface DemoCredential {
  fullName: string;
  email: string;
  password: string;
}

/**
 * Controls of the in-browser demo backend. Provided only by the `demo` build
 * (see `environments/environment.demo.ts`); `null` when talking to the real API.
 */
export interface DemoMode {
  readonly credentials: readonly DemoCredential[];
  /** Wipes everything created in this browser and restores the sample data. */
  reset(): Promise<void>;
}

export const DEMO_MODE = new InjectionToken<DemoMode | null>('DEMO_MODE', {
  providedIn: 'root',
  factory: () => null,
});
