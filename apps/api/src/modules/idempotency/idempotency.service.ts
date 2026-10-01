import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { EntityManager } from 'typeorm';
import { DomainError } from '../../common/errors/domain-error';
import type { Env } from '../../config/env.schema';
import { IDEMPOTENT_REPLAYED_HEADER } from './idempotency.constants';
import { requestFingerprint } from './request-fingerprint';

export interface IdempotentRequest {
  userId: string;
  key: string;
  /** Operation identifier, e.g. "POST /transfers". A key can't be reused across scopes. */
  scope: string;
  /** The validated request body; its fingerprint must match on replay. */
  payload: unknown;
}

export interface IdempotentResult<T> {
  status: number;
  body: T;
  replayed: boolean;
}

interface StoredKey {
  scope: string;
  request_hash: string;
  response_status: number | null;
  response_body: unknown;
}

/** Applies the status/header of an idempotent result to the HTTP response. */
export function sendIdempotent<T>(res: Response, result: IdempotentResult<T>): T {
  res.status(result.status);
  if (result.replayed) res.setHeader(IDEMPOTENT_REPLAYED_HEADER, 'true');
  return result.body;
}

/**
 * Exactly-once execution of a write, keyed by (user, Idempotency-Key).
 *
 * Runs INSIDE the caller's transaction:
 * 1. Claims the key with INSERT … ON CONFLICT. A concurrent request with the same
 *    key blocks on the uncommitted row (the primary key acts as a lock) until the
 *    first transaction commits or rolls back.
 * 2. Not claimed → the key already has a committed result: replay it if the
 *    request matches, or reject with IDEMPOTENCY_KEY_REUSED if it doesn't.
 * 3. Claimed → run the handler and store its response in the same transaction.
 *    If the handler fails, the rollback also releases the key, so the client
 *    can retry with it (only successful responses are stored).
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  async execute<T>(
    manager: EntityManager,
    request: IdempotentRequest,
    handler: () => Promise<T>,
    successStatus = 201,
  ): Promise<IdempotentResult<T>> {
    const requestHash = requestFingerprint(request.scope, request.payload);
    const ttlHours = this.config.get('IDEMPOTENCY_KEY_TTL_HOURS', { infer: true });

    // An expired key is taken over in place (ON CONFLICT … WHERE expired).
    const claimed = await manager.query<unknown[]>(
      `INSERT INTO idempotency_keys (user_id, key, scope, request_hash, expires_at)
       VALUES ($1, $2, $3, $4, now() + make_interval(hours => $5))
       ON CONFLICT (user_id, key) DO UPDATE
          SET scope = EXCLUDED.scope,
              request_hash = EXCLUDED.request_hash,
              response_status = NULL,
              response_body = NULL,
              created_at = now(),
              expires_at = EXCLUDED.expires_at
        WHERE idempotency_keys.expires_at <= now()
       RETURNING 1 AS claimed`,
      [request.userId, request.key, request.scope, requestHash, ttlHours],
    );

    if (claimed.length === 0) {
      return this.replay<T>(manager, request, requestHash);
    }

    const body = await handler();
    await manager.query(
      `UPDATE idempotency_keys SET response_status = $3, response_body = $4::jsonb
        WHERE user_id = $1 AND key = $2`,
      [request.userId, request.key, successStatus, JSON.stringify(body)],
    );
    return { status: successStatus, body, replayed: false };
  }

  private async replay<T>(
    manager: EntityManager,
    request: IdempotentRequest,
    requestHash: string,
  ): Promise<IdempotentResult<T>> {
    const [stored] = await manager.query<StoredKey[]>(
      `SELECT scope, request_hash, response_status, response_body
         FROM idempotency_keys WHERE user_id = $1 AND key = $2`,
      [request.userId, request.key],
    );
    if (!stored || stored.response_status === null) {
      // Unreachable while results are stored in the claiming transaction.
      throw new Error(`Idempotency key ${request.key} has no stored response`);
    }
    if (stored.scope !== request.scope || stored.request_hash !== requestHash) {
      throw new DomainError(
        'IDEMPOTENCY_KEY_REUSED',
        'This Idempotency-Key was already used for a different request. Use a new key.',
      );
    }
    return { status: stored.response_status, body: stored.response_body as T, replayed: true };
  }
}
