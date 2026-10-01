import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  buttonByText,
  el,
  problem,
  query,
  settle,
  text,
  typeInto,
  WALLET,
} from '../../../testing/fixtures';
import type { Transfer } from '../../core/api/api.models';
import { WalletStore } from '../../core/state/wallet.store';
import { normalizeAccountNumber, TransferPage } from './transfer.page';

describe('normalizeAccountNumber', () => {
  it.each([
    ['100000000042', '1000-0000-0042'],
    ['1000 0000 0042', '1000-0000-0042'],
    ['1000-0000-0042', '1000-0000-0042'],
  ])('%j → %j', (raw, expected) => expect(normalizeAccountNumber(raw)).toBe(expected));

  it.each(['', '1000-0000-004', '1000000000421', 'abcd-0000-0042'])('rejects %j', (raw) =>
    expect(normalizeAccountNumber(raw)).toBeNull(),
  );
});

const LOOKUP = {
  holderName: 'Luis A*** P***',
  accountNumber: '****-****-0042',
  alias: 'luis',
  currency: 'COP',
};

const transfer = (balanceAfterMinor: number): Transfer => ({
  id: 't-1',
  status: 'COMPLETED',
  journalEntryId: 'j-1',
  fromAccountId: WALLET.id,
  recipient: { holderName: LOOKUP.holderName, accountNumber: LOOKUP.accountNumber },
  amountMinor: 3_000_000,
  currency: 'COP',
  description: 'Almuerzo',
  balanceAfterMinor,
  createdAt: '2026-10-01T14:00:00.000Z',
});

describe('TransferPage', () => {
  let http: HttpTestingController;
  let store: WalletStore;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [TransferPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(WalletStore);
    const loaded = store.load();
    http.expectOne('/api/v1/accounts').flush([WALLET]); // balance $ 100.000
    await loaded;
  });

  afterEach(() => http.verify());

  async function render() {
    const fixture = TestBed.createComponent(TransferPage);
    await settle(fixture);
    return fixture;
  }

  type Fixture = Awaited<ReturnType<typeof render>>;

  async function submit(fixture: Fixture) {
    el(fixture, 'form').dispatchEvent(new Event('submit'));
    await settle(fixture);
  }

  async function findRecipient(fixture: Fixture, number = '1000 0000 0042') {
    typeInto(fixture, '#recipient', number);
    await submit(fixture);
    const req = http.expectOne((r) => r.url === '/api/v1/accounts/lookup');
    expect(req.request.params.get('number')).toBe('1000-0000-0042');
    req.flush(LOOKUP);
    await settle(fixture);
  }

  it('rejects a malformed account number without calling the API', async () => {
    const fixture = await render();
    typeInto(fixture, '#recipient', '123');
    await submit(fixture);
    http.expectNone((r) => r.url === '/api/v1/accounts/lookup');
  });

  it('blocks transfers to the own account on the client', async () => {
    const fixture = await render();
    typeInto(fixture, '#recipient', WALLET.number);
    await submit(fixture);
    http.expectNone((r) => r.url === '/api/v1/accounts/lookup');
    expect(text(query(fixture, '[data-testid="problem"]'))).toContain('tu misma cuenta');
  });

  it('explains when the recipient does not exist', async () => {
    const fixture = await render();
    typeInto(fixture, '#recipient', '1000-0000-0099');
    await submit(fixture);
    http
      .expectOne((r) => r.url === '/api/v1/accounts/lookup')
      .flush(problem(404, 'ACCOUNT_NOT_FOUND'), { status: 404, statusText: 'Not Found' });
    await settle(fixture);
    expect(text(query(fixture, '[data-testid="problem"]'))).toContain(
      'No encontramos una cuenta activa con esos datos.',
    );
  });

  it('looks up by alias (lower-cased)', async () => {
    const fixture = await render();
    buttonByText(fixture, 'Llave (alias)').click();
    await fixture.whenStable();
    typeInto(fixture, '#recipient', 'Luis');
    await submit(fixture);
    const req = http.expectOne((r) => r.url === '/api/v1/accounts/lookup');
    expect(req.request.params.get('alias')).toBe('luis');
    expect(req.request.params.has('number')).toBe(false);
    req.flush(LOOKUP);
    await settle(fixture);
    expect(text(query(fixture, '[data-testid="recipient"]'))).toContain('Luis A*** P***');
  });

  it('does not allow sending more than the balance', async () => {
    const fixture = await render();
    await findRecipient(fixture);
    typeInto(fixture, '#amount', '100.001');
    await submit(fixture);
    expect(query(fixture, '[data-testid="confirm-amount"]')).toBeNull();
  });

  it('recipient → amount → confirm → retry with the same key → done', async () => {
    const fixture = await render();
    await findRecipient(fixture);
    expect(text(query(fixture, '[data-testid="recipient"]'))).toContain('Luis A*** P***');

    typeInto(fixture, '#amount', '30.000');
    typeInto(fixture, '#description', '  Almuerzo ');
    await submit(fixture);
    expect(text(query(fixture, '[data-testid="confirm-amount"]'))).toBe('$ 30.000');

    buttonByText(fixture, 'Confirmar y enviar').click();
    await settle(fixture);
    const first = http.expectOne({ method: 'POST', url: '/api/v1/transfers' });
    expect(first.request.body).toEqual({
      fromAccountId: WALLET.id,
      toAccountNumber: '1000-0000-0042',
      amountMinor: 3_000_000,
      description: 'Almuerzo',
    });
    const key = first.request.headers.get('Idempotency-Key');
    first.flush(problem(503, 'SERVICE_UNAVAILABLE'), { status: 503, statusText: 'Unavailable' });
    await settle(fixture);

    buttonByText(fixture, 'Reintentar').click();
    await settle(fixture);
    const retry = http.expectOne('/api/v1/transfers');
    expect(retry.request.headers.get('Idempotency-Key')).toBe(key);
    retry.flush(transfer(7_000_000));
    await settle(fixture);

    expect(text(query(fixture, '[data-testid="transfer-success"]'))).toContain('$ 30.000');
    expect(store.balanceMinor()).toBe(7_000_000);
  });
});
