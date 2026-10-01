import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  buttonByText,
  el,
  query,
  settle,
  text,
  tx,
  typeInto,
  WALLET,
} from '../../../testing/fixtures';
import { WalletStore } from '../../core/state/wallet.store';
import { HISTORY_PAGE_SIZE, HistoryPage } from './history.page';

const URL = `/api/v1/accounts/${WALLET.id}/transactions`;

describe('HistoryPage', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [HistoryPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    const loaded = TestBed.inject(WalletStore).load();
    http.expectOne('/api/v1/accounts').flush([WALLET]);
    await loaded;
  });

  afterEach(() => http.verify());

  const page = (): TestRequest => http.expectOne((r) => r.url === URL);
  const rows = (fixture: { nativeElement: unknown }) =>
    (fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="transaction"]');

  async function render() {
    const fixture = TestBed.createComponent(HistoryPage);
    await settle(fixture);
    return fixture;
  }

  it('loads the first page and appends the next one with the cursor', async () => {
    const fixture = await render();
    const first = page();
    expect(first.request.params.get('limit')).toBe(String(HISTORY_PAGE_SIZE));
    expect(first.request.params.has('cursor')).toBe(false);
    first.flush({ items: [tx('1'), tx('2')], nextCursor: 'c-1' });
    await settle(fixture);
    expect(rows(fixture)).toHaveLength(2);

    buttonByText(fixture, 'Cargar más').click();
    await settle(fixture);
    const second = page();
    expect(second.request.params.get('cursor')).toBe('c-1');
    second.flush({ items: [tx('3')], nextCursor: null });
    await settle(fixture);

    expect(rows(fixture)).toHaveLength(3);
    expect(query(fixture, 'button.more')).toBeNull();
  });

  it('shows an empty state', async () => {
    const fixture = await render();
    page().flush({ items: [], nextCursor: null });
    await settle(fixture);
    expect(query(fixture, '[data-testid="empty-state"]')).not.toBeNull();
  });

  it('sends the filters (pesos → minor units, local days → ISO) and restarts paging', async () => {
    const fixture = await render();
    page().flush({ items: [tx('1')], nextCursor: 'c-1' });
    await settle(fixture);

    typeInto(fixture, '#f-type', 'TRANSFER');
    typeInto(fixture, '#f-direction', 'OUT');
    typeInto(fixture, '#f-from', '2026-10-01');
    typeInto(fixture, '#f-to', '2026-10-01');
    typeInto(fixture, '#f-min', '10.000');
    typeInto(fixture, '#f-max', '50.000,50');
    el(fixture, 'form').dispatchEvent(new Event('submit'));
    await settle(fixture);

    const filtered = page();
    const params = filtered.request.params;
    expect(params.get('type')).toBe('TRANSFER');
    expect(params.get('direction')).toBe('OUT');
    expect(params.get('minAmountMinor')).toBe('1000000');
    expect(params.get('maxAmountMinor')).toBe('5000050');
    expect(params.get('from')).toBe(new Date(2026, 9, 1).toISOString());
    expect(params.get('to')).toBe(new Date(2026, 9, 2).toISOString());
    expect(params.has('cursor')).toBe(false);
    filtered.flush({
      items: [tx('t', { type: 'TRANSFER', direction: 'OUT', amountMinor: 3_000_000 })],
      nextCursor: null,
    });
    await settle(fixture);
    expect(rows(fixture)).toHaveLength(1);

    buttonByText(fixture, 'Limpiar').click();
    await settle(fixture);
    const cleared = page();
    expect(cleared.request.params.keys()).toEqual(['limit']);
    cleared.flush({ items: [], nextCursor: null });
    await settle(fixture);
  });

  it('validates ranges in Spanish without calling the API', async () => {
    const fixture = await render();
    page().flush({ items: [], nextCursor: null });
    await settle(fixture);

    typeInto(fixture, '#f-min', '50.000');
    typeInto(fixture, '#f-max', '10.000');
    el(fixture, 'form').dispatchEvent(new Event('submit'));
    await settle(fixture);
    http.expectNone((r) => r.url === URL);
    expect(text(fixture.nativeElement as HTMLElement)).toContain(
      'El monto mínimo no puede ser mayor que el máximo.',
    );
  });

  it('shows a problem+json error', async () => {
    const fixture = await render();
    page().flush(
      { type: 'about:blank', title: 'Bad', status: 400, code: 'INVALID_CURSOR', detail: '' },
      { status: 400, statusText: 'Bad Request' },
    );
    await settle(fixture);
    expect(text(query(fixture, '[data-testid="problem"]'))).toContain('No pudimos cargar más');
  });
});
