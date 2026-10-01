import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { buttonByText, el, query, settle, text, typeInto, WALLET } from '../../../testing/fixtures';
import type { Deposit } from '../../core/api/api.models';
import { WalletStore } from '../../core/state/wallet.store';
import { DepositPage } from './deposit.page';

const deposit = (amountMinor: number, balanceAfterMinor: number): Deposit => ({
  id: 'd-1',
  accountId: WALLET.id,
  amountMinor,
  currency: 'COP',
  balanceAfterMinor,
  description: 'Demo top-up',
  createdAt: '2026-10-01T14:00:00.000Z',
});

describe('DepositPage', () => {
  let http: HttpTestingController;
  let store: WalletStore;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [DepositPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(WalletStore);
    const loaded = store.load();
    http.expectOne('/api/v1/accounts').flush([WALLET]);
    await loaded;
  });

  afterEach(() => http.verify());

  async function render() {
    const fixture = TestBed.createComponent(DepositPage);
    await fixture.whenStable();
    return fixture;
  }

  async function submitForm(fixture: Awaited<ReturnType<typeof render>>) {
    el(fixture, 'form').dispatchEvent(new Event('submit'));
    await settle(fixture);
  }

  it('validates the amount before calling the API', async () => {
    const fixture = await render();
    typeInto(fixture, '#amount', '25,000.00');
    await submitForm(fixture);
    http.expectNone('/api/v1/deposits');
    expect(text(fixture.nativeElement as HTMLElement)).toMatch(/monto válido/i);
  });

  it('quick amounts fill the field', async () => {
    const fixture = await render();
    buttonByText(fixture, '100.000').click();
    await fixture.whenStable();
    expect(el<HTMLInputElement>(fixture, '#amount').value).toBe('100000');
  });

  it('retries a lost response with the SAME Idempotency-Key, then uses a new one', async () => {
    const fixture = await render();
    typeInto(fixture, '#amount', '25.000');
    await submitForm(fixture);

    const first = http.expectOne({ method: 'POST', url: '/api/v1/deposits' });
    expect(first.request.body).toEqual({ accountId: WALLET.id, amountMinor: 2_500_000 });
    const key = first.request.headers.get('Idempotency-Key');
    expect(key).toBeTruthy();
    first.error(new ProgressEvent('error')); // network failure: outcome unknown
    await settle(fixture);

    expect(text(query(fixture, '[data-testid="problem"]'))).toContain('No pudimos conectar');
    buttonByText(fixture, 'Reintentar').click();
    await settle(fixture);

    const retry = http.expectOne('/api/v1/deposits');
    expect(retry.request.headers.get('Idempotency-Key')).toBe(key);
    retry.flush(deposit(2_500_000, 12_500_000));
    await settle(fixture);

    expect(text(query(fixture, '[data-testid="deposit-success"]'))).toContain('$ 25.000');
    expect(store.balanceMinor()).toBe(12_500_000);

    // A new deposit is a new intent → new key, even for the same amount.
    buttonByText(fixture, 'Hacer otro depósito').click();
    await fixture.whenStable();
    typeInto(fixture, '#amount', '25.000');
    await submitForm(fixture);
    const next = http.expectOne('/api/v1/deposits');
    expect(next.request.headers.get('Idempotency-Key')).not.toBe(key);
    next.flush(deposit(2_500_000, 15_000_000));
    await settle(fixture);
  });

  it('shows business errors without a retry button', async () => {
    const fixture = await render();
    typeInto(fixture, '#amount', '900.000');
    await submitForm(fixture);
    http.expectOne('/api/v1/deposits').flush(
      {
        type: 'about:blank',
        title: 'Limit',
        status: 422,
        code: 'DAILY_DEPOSIT_LIMIT_EXCEEDED',
        detail: '',
        remainingMinor: 10_000_000,
      },
      { status: 422, statusText: 'Unprocessable' },
    );
    await settle(fixture);
    const alert = query(fixture, '[data-testid="problem"]');
    expect(text(alert)).toContain('$ 100.000');
    expect(alert?.querySelector('button')).toBeNull();
  });
});
