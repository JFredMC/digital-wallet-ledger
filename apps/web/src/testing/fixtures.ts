import type { ComponentFixture } from '@angular/core/testing';
import type {
  Account,
  AuthResponse,
  ProblemDetails,
  Transaction,
} from '../app/core/api/api.models';

/** Test-only fixtures and DOM helpers (excluded from the app build). */

export const USER = {
  id: 'u-1',
  email: 'ana@example.com',
  fullName: 'Ana María Gómez',
  role: 'USER' as const,
  createdAt: '2026-10-01T14:00:00.000Z',
};

export function authResponse(accessToken = 'token-1', user = USER): AuthResponse {
  return { accessToken, tokenType: 'Bearer', expiresIn: 900, user };
}

export const WALLET: Account = {
  id: 'acc-1',
  number: '1000-0000-0001',
  alias: 'ana',
  type: 'USER_WALLET',
  currency: 'COP',
  balanceMinor: 10_000_000,
  status: 'ACTIVE',
  createdAt: '2026-10-01T14:00:00.000Z',
};

export function problem(status: number, code: string, extra: Partial<ProblemDetails> = {}) {
  return {
    type: 'about:blank',
    title: code,
    status,
    code,
    detail: code,
    requestId: 'req-1',
    ...extra,
  } satisfies ProblemDetails;
}

export function tx(id: string, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id,
    type: 'DEPOSIT',
    direction: 'IN',
    amountMinor: 5_000_000,
    balanceAfterMinor: 5_000_000,
    currency: 'COP',
    description: 'Demo top-up',
    counterparty: null,
    transferId: null,
    createdAt: '2026-10-01T14:00:00.000Z',
    ...overrides,
  };
}

/** Lets pending promises/microtasks run, then renders (zoneless). */
export async function settle(fixture?: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 3; i++) await new Promise((resolve) => setTimeout(resolve));
  if (fixture) await fixture.whenStable();
}

export function el<T extends HTMLElement = HTMLElement>(
  fixture: ComponentFixture<unknown>,
  selector: string,
): T {
  const found = (fixture.nativeElement as HTMLElement).querySelector<T>(selector);
  if (!found) throw new Error(`Element not found: ${selector}`);
  return found;
}

export function query(fixture: ComponentFixture<unknown>, selector: string): HTMLElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector(selector);
}

export function typeInto(fixture: ComponentFixture<unknown>, selector: string, value: string) {
  const input = el<HTMLInputElement | HTMLSelectElement>(fixture, selector);
  input.value = value;
  input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input'));
}

export function buttonByText(fixture: ComponentFixture<unknown>, text: string): HTMLButtonElement {
  const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll('button');
  const match = Array.from(buttons).find((b) => b.textContent?.trim().includes(text));
  if (!match) throw new Error(`Button not found: ${text}`);
  return match;
}

/** "$ 25.000" with a non-breaking space → plain spaces, for readable assertions. */
export function text(node: Element | null): string {
  return (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
}
