import { inject, Injectable, InjectionToken } from '@angular/core';
import type { DemoMode } from '../core/demo/demo-mode';
import {
  DEMO_DB_VERSION,
  DEMO_LIMITS,
  type DemoAccount,
  type DemoDb,
  type DemoMovement,
  type DemoUser,
  hashPassword,
  insertUser,
  maskAccountNumber,
  maskHolderName,
  newId,
  postDeposit,
  postTransfer,
} from './demo-db';
import { DemoError, validationError } from './demo-errors';
import { createSeedDb, DEMO_CREDENTIALS } from './demo-seed';

export const DEMO_STORAGE_KEY = 'billetera-demo:db';

/** Where the demo data lives (localStorage in the browser, swappable in tests). */
export const DEMO_STORAGE = new InjectionToken<Storage>('DEMO_STORAGE', {
  providedIn: 'root',
  factory: () => localStorage,
});

/** Current time in ms (injectable so tests can move the clock). */
export const DEMO_CLOCK = new InjectionToken<() => number>('DEMO_CLOCK', {
  providedIn: 'root',
  factory: () => () => Date.now(),
});

export interface DemoRequest {
  method: string;
  /** Path after /api/v1, e.g. "/accounts/123/transactions". */
  path: string;
  query: Record<string, string>;
  header: (name: string) => string | null;
  body: unknown;
}

export interface DemoResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

interface Ctx {
  db: DemoDb;
  req: DemoRequest;
  now: number;
  params: string[];
}

type Handler = (ctx: Ctx) => DemoResponse | Promise<DemoResponse>;

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,255}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ACCOUNT_NUMBER_PATTERN = /^\d{4}-\d{4}-\d{4}$/;
const HISTORY_QUERY_KEYS = [
  'limit',
  'cursor',
  'type',
  'direction',
  'from',
  'to',
  'minAmountMinor',
  'maxAmountMinor',
];

const ok = (body: unknown, status = 200): DemoResponse => ({ status, body });

/**
 * In-browser implementation of the REST API used by the GitHub Pages demo.
 * Mirrors the API contract: same routes, JSON shapes, status codes, error
 * codes (problem+json), Idempotency-Key semantics, limits, masking and
 * cursor pagination. Each request reads the database from storage, works on
 * that copy and writes it back only if the request succeeds, so a failed
 * request never leaves partial changes (like a rolled-back transaction).
 */
@Injectable({ providedIn: 'root' })
export class DemoBackend implements DemoMode {
  private readonly storage = inject(DEMO_STORAGE);
  private readonly clock = inject(DEMO_CLOCK);

  readonly credentials = DEMO_CREDENTIALS;

  private readonly routes: [method: string, pattern: RegExp, handler: Handler][] = [
    ['GET', /^\/health$/, () => ok({ status: 'ok', info: { demo: { status: 'up' } } })],
    ['POST', /^\/auth\/register$/, (c) => this.register(c)],
    ['POST', /^\/auth\/login$/, (c) => this.login(c)],
    ['POST', /^\/auth\/refresh$/, (c) => this.refresh(c)],
    ['POST', /^\/auth\/logout$/, (c) => this.logout(c)],
    ['GET', /^\/auth\/me$/, (c) => ok(publicUser(this.authenticate(c)))],
    ['GET', /^\/accounts$/, (c) => this.listAccounts(c)],
    ['GET', /^\/accounts\/lookup$/, (c) => this.lookup(c)],
    ['GET', /^\/accounts\/([^/]+)\/transactions$/, (c) => this.history(c)],
    ['GET', /^\/accounts\/([^/]+)$/, (c) => ok(publicAccount(this.ownedAccount(c, c.params[0])))],
    ['POST', /^\/deposits$/, (c) => this.deposit(c)],
    ['POST', /^\/transfers$/, (c) => this.transfer(c)],
  ];

  async handle(req: DemoRequest): Promise<DemoResponse> {
    const instance = `/api/v1${req.path}`;
    try {
      const route = this.routes.find(([method, pattern]) => {
        return method === req.method && pattern.test(req.path);
      });
      if (!route) throw new DemoError('NOT_FOUND', `Cannot ${req.method} ${instance}`);
      const [, pattern, handler] = route;
      const db = await this.load();
      const params = (pattern.exec(req.path) ?? []).slice(1);
      const ctx: Ctx = { db, req, now: this.clock(), params };
      const response = await handler(ctx);
      if (req.method !== 'GET') this.save(ctx.db);
      return response;
    } catch (error) {
      const problem =
        error instanceof DemoError
          ? error
          : new DemoError('INTERNAL_ERROR', 'An unexpected error occurred.');
      if (!(error instanceof DemoError)) console.error('[demo backend]', error);
      return {
        status: problem.status,
        body: problem.toProblem(instance),
        headers: { 'Content-Type': 'application/problem+json' },
      };
    }
  }

  async reset(): Promise<void> {
    this.save(await createSeedDb(this.clock()));
  }

  // ---------------------------------------------------------------- storage

  private loadStored(): DemoDb | null {
    try {
      const raw = this.storage.getItem(DEMO_STORAGE_KEY);
      const db = raw ? (JSON.parse(raw) as DemoDb) : null;
      return db?.version === DEMO_DB_VERSION ? db : null;
    } catch {
      return null; // corrupted data: start over with the sample data
    }
  }

  private async load(): Promise<DemoDb> {
    const stored = this.loadStored();
    if (stored) return stored;
    const seeded = await createSeedDb(this.clock());
    this.save(seeded);
    return seeded;
  }

  private save(db: DemoDb): void {
    const now = this.clock();
    for (const [key, record] of Object.entries(db.idempotency)) {
      if (record.expiresAt <= now) delete db.idempotency[key];
    }
    this.storage.setItem(DEMO_STORAGE_KEY, JSON.stringify(db));
  }

  // ------------------------------------------------------------------- auth

  private async register(c: Ctx): Promise<DemoResponse> {
    const body = objectBody(c.req.body, ['email', 'password', 'fullName']);
    const email = typeof body['email'] === 'string' ? body['email'].trim().toLowerCase() : '';
    const password = typeof body['password'] === 'string' ? body['password'] : '';
    const fullName = typeof body['fullName'] === 'string' ? body['fullName'].trim() : '';
    const errors: string[] = [];
    if (!EMAIL_PATTERN.test(email) || email.length > 254) errors.push('email must be an email');
    if (
      password.length < 8 ||
      password.length > 72 ||
      !/[A-Za-z]/.test(password) ||
      !/\d/.test(password)
    ) {
      errors.push('password must be 8-72 characters and contain a letter and a number');
    }
    if (fullName.length < 2 || fullName.length > 120) {
      errors.push(
        'fullName must be longer than or equal to 2 and shorter than or equal to 120 characters',
      );
    }
    if (errors.length) throw validationError(errors);
    if (c.db.users.some((u) => u.email === email)) {
      throw new DemoError('EMAIL_ALREADY_REGISTERED', 'An account with this email already exists.');
    }

    const salt = newId();
    const passwordHash = await hashPassword(password, salt);
    // Re-read after the async hash so a concurrent tab's writes are not lost.
    c.db = this.loadStored() ?? c.db;
    if (c.db.users.some((u) => u.email === email)) {
      throw new DemoError('EMAIL_ALREADY_REGISTERED', 'An account with this email already exists.');
    }
    const { user } = insertUser(c.db, { email, fullName, salt, passwordHash }, c.now);
    return ok(this.startSession(c, user), 201);
  }

  private async login(c: Ctx): Promise<DemoResponse> {
    const body = objectBody(c.req.body, ['email', 'password']);
    const email = typeof body['email'] === 'string' ? body['email'].trim().toLowerCase() : '';
    const password = typeof body['password'] === 'string' ? body['password'] : '';
    const user = c.db.users.find((u) => u.email === email);
    // Hash even for unknown emails, like the API (no user enumeration by timing).
    const hash = await hashPassword(password, user?.salt ?? 'unknown-user');
    if (!user || hash !== user.passwordHash) {
      throw new DemoError('INVALID_CREDENTIALS', 'Invalid email or password.');
    }
    c.db = this.loadStored() ?? c.db;
    return ok(this.startSession(c, user));
  }

  /** The "refresh cookie" is the session stored with the demo data. */
  private refresh(c: Ctx): DemoResponse {
    const session = c.db.session;
    const user = session && c.db.users.find((u) => u.id === session.userId);
    if (!session || !user || session.expiresAt <= c.now) {
      c.db.session = null;
      throw new DemoError('INVALID_REFRESH_TOKEN', 'No active session.');
    }
    return ok(this.authResponse(c, user, session.sid));
  }

  private logout(c: Ctx): DemoResponse {
    c.db.session = null;
    return { status: 204, body: null };
  }

  private startSession(c: Ctx, user: DemoUser) {
    const sid = newId();
    c.db.session = { sid, userId: user.id, expiresAt: c.now + DEMO_LIMITS.sessionTtlMs };
    return this.authResponse(c, user, sid);
  }

  private authResponse(c: Ctx, user: DemoUser, sid: string) {
    const exp = c.now + DEMO_LIMITS.accessTokenTtlSeconds * 1000;
    return {
      accessToken: `demo.${btoa(JSON.stringify({ sub: user.id, sid, exp }))}`,
      tokenType: 'Bearer',
      expiresIn: DEMO_LIMITS.accessTokenTtlSeconds,
      user: publicUser(user),
    };
  }

  /** Validates the bearer token: not expired and from the current session. */
  private authenticate(c: Ctx): DemoUser {
    const header = c.req.header('Authorization') ?? '';
    const match = /^Bearer demo\.(.+)$/.exec(header);
    let claims: { sub?: string; sid?: string; exp?: number } = {};
    try {
      claims = match ? JSON.parse(atob(match[1])) : {};
    } catch {
      claims = {};
    }
    const session = c.db.session;
    const user = c.db.users.find((u) => u.id === claims.sub);
    if (
      !user ||
      !session ||
      claims.sid !== session.sid ||
      typeof claims.exp !== 'number' ||
      claims.exp <= c.now
    ) {
      throw new DemoError('UNAUTHORIZED', 'Missing or invalid access token.');
    }
    return user;
  }

  // --------------------------------------------------------------- accounts

  private listAccounts(c: Ctx): DemoResponse {
    const user = this.authenticate(c);
    return ok(c.db.accounts.filter((a) => a.userId === user.id).map(publicAccount));
  }

  private ownedAccount(c: Ctx, id: string | undefined): DemoAccount {
    const user = this.authenticate(c);
    const account = c.db.accounts.find((a) => a.id === id && a.userId === user.id);
    if (!account) throw new DemoError('ACCOUNT_NOT_FOUND', 'Account not found.');
    return account;
  }

  private lookup(c: Ctx): DemoResponse {
    this.authenticate(c);
    const { number, alias } = c.req.query;
    const unknown = Object.keys(c.req.query).filter((k) => k !== 'number' && k !== 'alias');
    if (unknown.length) throw validationError(unknown.map((k) => `property ${k} should not exist`));
    if ((number === undefined) === (alias === undefined)) {
      throw validationError(['provide exactly one of number or alias']);
    }
    const found = this.findRecipient(c.db, { number, alias });
    if (!found) throw new DemoError('ACCOUNT_NOT_FOUND', 'Account not found.');
    return ok({
      holderName: maskHolderName(found.holder.fullName),
      accountNumber: maskAccountNumber(found.account.number),
      alias: found.account.alias,
      currency: found.account.currency,
    });
  }

  private findRecipient(db: DemoDb, query: { number?: string; alias?: string }) {
    const alias = query.alias?.trim().toLowerCase();
    const account = db.accounts.find((a) =>
      query.number !== undefined
        ? a.number === query.number
        : a.alias !== null && a.alias === alias,
    );
    const holder = account && db.users.find((u) => u.id === account.userId);
    return account && holder && account.status === 'ACTIVE' ? { account, holder } : null;
  }

  // ---------------------------------------------------------- money movement

  /** Runs `execute` once per (user, scope, key); replays the stored success. */
  private idempotent(c: Ctx, scope: string, execute: () => DemoResponse): DemoResponse {
    const user = this.authenticate(c);
    const key = this.idempotencyKey(c);
    const id = `${user.id}|${scope}|${key}`;
    const fingerprint = stableJson(c.req.body);
    const stored = c.db.idempotency[id];
    if (stored && stored.expiresAt > c.now) {
      if (stored.fingerprint !== fingerprint) {
        throw new DemoError(
          'IDEMPOTENCY_KEY_REUSED',
          'This Idempotency-Key was already used with a different request.',
        );
      }
      return {
        status: stored.status,
        body: stored.body,
        headers: { 'Idempotent-Replayed': 'true' },
      };
    }
    const response = execute(); // throws on failure: failures are not stored
    c.db.idempotency[id] = {
      fingerprint,
      status: response.status,
      body: response.body,
      expiresAt: c.now + DEMO_LIMITS.idempotencyTtlMs,
    };
    return response;
  }

  private idempotencyKey(c: Ctx): string {
    const key = c.req.header('Idempotency-Key');
    if (key === null) {
      throw new DemoError('IDEMPOTENCY_KEY_REQUIRED', 'The Idempotency-Key header is required.');
    }
    if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
      throw new DemoError(
        'IDEMPOTENCY_KEY_INVALID',
        'Idempotency-Key must be 8-255 characters of [A-Za-z0-9._:-].',
      );
    }
    return key;
  }

  private deposit(c: Ctx): DemoResponse {
    this.authenticate(c);
    this.idempotencyKey(c);
    const body = objectBody(c.req.body, ['accountId', 'amountMinor', 'description']);
    const errors = [
      ...uuidErrors(body, 'accountId'),
      ...amountErrors(body, 'amountMinor'),
      ...descriptionErrors(body),
    ];
    if (errors.length) throw validationError(errors);

    return this.idempotent(c, 'POST /deposits', () => {
      const account = this.ownedAccount(c, body['accountId'] as string);
      const description = (body['description'] as string | undefined)?.trim() || 'Demo top-up';
      const amount = body['amountMinor'] as number;
      const movement = postDeposit(c.db, account, amount, description, c.now);
      return ok(
        {
          id: movement.id,
          accountId: account.id,
          amountMinor: movement.amountMinor,
          currency: account.currency,
          balanceAfterMinor: movement.balanceAfterMinor,
          description,
          createdAt: movement.createdAt,
        },
        201,
      );
    });
  }

  private transfer(c: Ctx): DemoResponse {
    this.authenticate(c);
    this.idempotencyKey(c);
    const body = objectBody(c.req.body, [
      'fromAccountId',
      'toAccountNumber',
      'toAlias',
      'amountMinor',
      'description',
    ]);
    const errors = [
      ...uuidErrors(body, 'fromAccountId'),
      ...amountErrors(body, 'amountMinor'),
      ...descriptionErrors(body),
    ];
    const number = body['toAccountNumber'];
    const alias = body['toAlias'];
    if ((number === undefined) === (alias === undefined)) {
      errors.push('provide exactly one of toAccountNumber or toAlias');
    }
    if (
      number !== undefined &&
      (typeof number !== 'string' || !ACCOUNT_NUMBER_PATTERN.test(number))
    ) {
      errors.push('toAccountNumber must look like 1000-0000-0042');
    }
    if (
      alias !== undefined &&
      (typeof alias !== 'string' || alias.trim().length < 2 || alias.trim().length > 50)
    ) {
      errors.push(
        'toAlias must be longer than or equal to 2 and shorter than or equal to 50 characters',
      );
    }
    if (errors.length) throw validationError(errors);

    const amount = body['amountMinor'] as number;
    if (amount > DEMO_LIMITS.maxTransferMinor) {
      throw new DemoError('TRANSFER_LIMIT_EXCEEDED', 'The amount exceeds the per-transfer limit.', {
        maxAmountMinor: DEMO_LIMITS.maxTransferMinor,
      });
    }

    return this.idempotent(c, 'POST /transfers', () => {
      const source = this.ownedAccount(c, body['fromAccountId'] as string);
      const recipient = this.findRecipient(c.db, {
        number: number as string | undefined,
        alias: alias as string | undefined,
      });
      if (!recipient) {
        throw new DemoError('RECIPIENT_NOT_FOUND', 'No active wallet matches that recipient.');
      }
      const description = (body['description'] as string | undefined)?.trim() || null;
      const posted = postTransfer(c.db, source, recipient.account, amount, description, c.now);
      return ok(
        {
          id: posted.transferId,
          status: 'COMPLETED',
          journalEntryId: posted.journalEntryId,
          fromAccountId: source.id,
          recipient: {
            holderName: maskHolderName(recipient.holder.fullName),
            accountNumber: maskAccountNumber(recipient.account.number),
          },
          amountMinor: amount,
          currency: source.currency,
          description,
          balanceAfterMinor: posted.debit.balanceAfterMinor,
          createdAt: posted.debit.createdAt,
        },
        201,
      );
    });
  }

  // ---------------------------------------------------------------- history

  private history(c: Ctx): DemoResponse {
    const q = c.req.query;
    const errors = Object.keys(q)
      .filter((k) => !HISTORY_QUERY_KEYS.includes(k))
      .map((k) => `property ${k} should not exist`);
    const int = (name: string, min: number, max: number) => {
      const raw = q[name];
      if (raw === undefined) return undefined;
      const value = Number(raw);
      if (!/^\d+$/.test(raw) || value < min || value > max) {
        errors.push(`${name} must be an integer between ${min} and ${max}`);
      }
      return value;
    };
    const date = (name: string) => {
      const raw = q[name];
      if (raw === undefined) return undefined;
      const value = Date.parse(raw);
      if (Number.isNaN(value)) errors.push(`${name} must be a valid ISO 8601 date string`);
      return value;
    };
    const limit = int('limit', 1, 100) ?? 20;
    const min = int('minAmountMinor', 1, Number.MAX_SAFE_INTEGER);
    const max = int('maxAmountMinor', 1, Number.MAX_SAFE_INTEGER);
    const from = date('from');
    const to = date('to');
    const { type, direction, cursor } = q;
    if (type !== undefined && type !== 'DEPOSIT' && type !== 'TRANSFER') {
      errors.push('type must be one of the following values: DEPOSIT, TRANSFER');
    }
    if (direction !== undefined && direction !== 'IN' && direction !== 'OUT') {
      errors.push('direction must be one of the following values: IN, OUT');
    }
    if (cursor !== undefined && cursor.length > 200) {
      errors.push('cursor must be shorter than or equal to 200 characters');
    }
    if (errors.length) throw validationError(errors);
    if (from !== undefined && to !== undefined && from >= to)
      errors.push('from must be earlier than to');
    if (min !== undefined && max !== undefined && min > max) {
      errors.push('minAmountMinor must not exceed maxAmountMinor');
    }
    if (errors.length) throw validationError(errors);

    const account = this.ownedAccount(c, c.params[0]);
    const after = cursor === undefined ? null : decodeCursor(cursor);

    const matches = c.db.movements
      .filter((m) => {
        const at = Date.parse(m.createdAt);
        return (
          m.accountId === account.id &&
          (type === undefined || m.type === type) &&
          (direction === undefined || m.direction === direction) &&
          (from === undefined || at >= from) &&
          (to === undefined || at < to) &&
          (min === undefined || m.amountMinor >= min) &&
          (max === undefined || m.amountMinor <= max) &&
          (after === null || at < after.at || (at === after.at && m.seq < after.seq))
        );
      })
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.seq - a.seq);

    const page = matches.slice(0, limit);
    const last = page.at(-1);
    return ok({
      items: page.map((m) => this.toTransaction(c.db, m)),
      nextCursor:
        matches.length > limit && last
          ? encodeCursor({ at: Date.parse(last.createdAt), seq: last.seq })
          : null,
    });
  }

  private toTransaction(db: DemoDb, m: DemoMovement) {
    const other = m.counterpartyAccountId
      ? db.accounts.find((a) => a.id === m.counterpartyAccountId)
      : undefined;
    const holder = other && db.users.find((u) => u.id === other.userId);
    return {
      id: m.id,
      type: m.type,
      direction: m.direction,
      amountMinor: m.amountMinor,
      balanceAfterMinor: m.balanceAfterMinor,
      currency: m.currency,
      description: m.description,
      counterparty:
        other && holder
          ? {
              holderName: maskHolderName(holder.fullName),
              accountNumber: maskAccountNumber(other.number),
            }
          : null,
      transferId: m.transferId,
      createdAt: m.createdAt,
    };
  }
}

// ------------------------------------------------------------------ helpers

function publicUser(user: DemoUser) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    createdAt: user.createdAt,
  };
}

function publicAccount(account: DemoAccount) {
  return {
    id: account.id,
    number: account.number,
    alias: account.alias,
    type: account.type,
    currency: account.currency,
    balanceMinor: account.balanceMinor,
    status: account.status,
    createdAt: account.createdAt,
  };
}

/** A JSON object body with only the allowed properties (forbidNonWhitelisted). */
function objectBody(body: unknown, allowed: string[]): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw validationError(['request body must be a JSON object']);
  }
  const extra = Object.keys(body).filter((k) => !allowed.includes(k));
  if (extra.length) throw validationError(extra.map((k) => `property ${k} should not exist`));
  return body as Record<string, unknown>;
}

function uuidErrors(body: Record<string, unknown>, field: string): string[] {
  const value = body[field];
  return typeof value === 'string' && UUID_PATTERN.test(value) ? [] : [`${field} must be a UUID`];
}

function amountErrors(body: Record<string, unknown>, field: string): string[] {
  const value = body[field];
  return Number.isSafeInteger(value) && (value as number) > 0
    ? []
    : [`${field} must be a positive integer`];
}

function descriptionErrors(body: Record<string, unknown>): string[] {
  const value = body['description'];
  if (value === undefined) return [];
  return typeof value === 'string' && value.trim().length <= 140
    ? []
    : ['description must be shorter than or equal to 140 characters'];
}

/** JSON with sorted keys: equal payloads → equal fingerprints. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function encodeCursor(cursor: { at: number; seq: number }): string {
  return btoa(JSON.stringify(cursor)).replace(/=+$/, '');
}

function decodeCursor(raw: string): { at: number; seq: number } {
  try {
    const value = JSON.parse(atob(raw)) as { at?: unknown; seq?: unknown };
    if (Number.isFinite(value.at) && Number.isInteger(value.seq)) {
      return value as { at: number; seq: number };
    }
  } catch {
    // fall through
  }
  throw new DemoError('INVALID_CURSOR', 'The cursor is malformed.');
}
