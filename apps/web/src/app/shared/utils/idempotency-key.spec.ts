import { IdempotencyKeyTracker } from './idempotency-key';

describe('IdempotencyKeyTracker', () => {
  let counter: number;
  let tracker: IdempotencyKeyTracker;

  beforeEach(() => {
    counter = 0;
    tracker = new IdempotencyKeyTracker(() => `key-${++counter}`);
  });

  it('reuses the same key while the same payload is retried', () => {
    const payload = { accountId: 'a', amountMinor: 100 };
    expect(tracker.keyFor(payload)).toBe('key-1');
    expect(tracker.keyFor({ ...payload })).toBe('key-1');
    expect(tracker.keyFor(payload)).toBe('key-1');
  });

  it('creates a new key when the payload changes', () => {
    expect(tracker.keyFor({ amountMinor: 100 })).toBe('key-1');
    expect(tracker.keyFor({ amountMinor: 200 })).toBe('key-2');
    expect(tracker.keyFor({ amountMinor: 100 })).toBe('key-3');
  });

  it('creates a new key for the next intent after a success', () => {
    const payload = { amountMinor: 100 };
    expect(tracker.keyFor(payload)).toBe('key-1');
    tracker.reset();
    expect(tracker.keyFor(payload)).toBe('key-2');
  });

  it('defaults to random UUIDs that satisfy the API key format', () => {
    const key = new IdempotencyKeyTracker().keyFor({});
    expect(key).toMatch(/^[A-Za-z0-9._:-]{8,255}$/);
  });
});
