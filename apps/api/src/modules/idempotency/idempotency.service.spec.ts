import type { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { EntityManager } from 'typeorm';
import { IdempotencyService, sendIdempotent } from './idempotency.service';
import { requestFingerprint } from './request-fingerprint';

const request = {
  userId: 'user-1',
  key: 'key-12345678',
  scope: 'POST /transfers',
  payload: { amountMinor: 100 },
};

function setup(queryResults: unknown[][]) {
  const query = jest.fn();
  for (const result of queryResults) query.mockResolvedValueOnce(result);
  const manager = { query } as unknown as EntityManager;
  const config = { get: () => 24 } as unknown as ConfigService<never, true>;
  return { service: new IdempotencyService(config), manager, query };
}

describe('IdempotencyService', () => {
  it('runs the handler once the key is claimed and stores its response', async () => {
    const { service, manager, query } = setup([[{ claimed: 1 }], []]);
    const handler = jest.fn().mockResolvedValue({ id: 'transfer-1' });

    await expect(service.execute(manager, request, handler)).resolves.toEqual({
      status: 201,
      body: { id: 'transfer-1' },
      replayed: false,
    });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toMatch(/INSERT INTO idempotency_keys[\s\S]*ON CONFLICT/);
    expect(query.mock.calls[0][1]).toEqual([
      'user-1',
      'key-12345678',
      'POST /transfers',
      requestFingerprint('POST /transfers', { amountMinor: 100 }),
      24,
    ]);
    expect(query.mock.calls[1][1]).toEqual(['user-1', 'key-12345678', 201, '{"id":"transfer-1"}']);
  });

  it('does not store anything when the handler fails (the rollback frees the key)', async () => {
    const { service, manager, query } = setup([[{ claimed: 1 }]]);
    const handler = jest.fn().mockRejectedValue(new Error('INSUFFICIENT_FUNDS'));
    await expect(service.execute(manager, request, handler)).rejects.toThrow('INSUFFICIENT_FUNDS');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('replays the stored response for the same request without running the handler', async () => {
    const stored = {
      scope: 'POST /transfers',
      request_hash: requestFingerprint('POST /transfers', { amountMinor: 100 }),
      response_status: 201,
      response_body: { id: 'transfer-1' },
    };
    const { service, manager } = setup([[], [stored]]);
    const handler = jest.fn();

    await expect(service.execute(manager, request, handler)).resolves.toEqual({
      status: 201,
      body: { id: 'transfer-1' },
      replayed: true,
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([
    ['a different body', { scope: 'POST /transfers', payload: { amountMinor: 999 } }],
    ['a different endpoint', { scope: 'POST /deposits', payload: { amountMinor: 100 } }],
  ])('rejects a key reused with %s', async (_label, original) => {
    const stored = {
      scope: original.scope,
      request_hash: requestFingerprint(original.scope, original.payload),
      response_status: 201,
      response_body: {},
    };
    const { service, manager } = setup([[], [stored]]);
    await expect(service.execute(manager, request, jest.fn())).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
      status: 422,
    });
  });

  it('fails loudly if a committed key has no response', async () => {
    const { service, manager } = setup([[], []]);
    await expect(service.execute(manager, request, jest.fn())).rejects.toThrow(/no stored/);
  });
});

describe('sendIdempotent', () => {
  it('sets the status and marks replays', () => {
    const res = { status: jest.fn(), setHeader: jest.fn() };
    expect(
      sendIdempotent(res as unknown as Response, { status: 201, body: 'b', replayed: true }),
    ).toBe('b');
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.setHeader).toHaveBeenCalledWith('Idempotent-Replayed', 'true');
  });
});
