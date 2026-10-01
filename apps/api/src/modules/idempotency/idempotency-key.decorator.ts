import { applyDecorators, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ApiHeader, ApiResponse } from '@nestjs/swagger';
import type { Request } from 'express';
import { DomainError } from '../../common/errors/domain-error';
import { ProblemDetailsDto } from '../../common/filters/problem-details.dto';
import {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_KEY_PATTERN,
  IDEMPOTENT_REPLAYED_HEADER,
} from './idempotency.constants';

/** Validates the raw header value; exported for unit tests. */
export function parseIdempotencyKey(value: string | string[] | undefined): string {
  if (value === undefined || value === '') {
    throw new DomainError(
      'IDEMPOTENCY_KEY_REQUIRED',
      `This operation requires an ${IDEMPOTENCY_KEY_HEADER} header (a UUID v4 is recommended).`,
    );
  }
  if (Array.isArray(value) || !IDEMPOTENCY_KEY_PATTERN.test(value)) {
    throw new DomainError(
      'IDEMPOTENCY_KEY_INVALID',
      `${IDEMPOTENCY_KEY_HEADER} must be 8–255 characters from [A-Za-z0-9._:-].`,
    );
  }
  return value;
}

/** Injects the validated `Idempotency-Key` header (required). */
export const IdempotencyKey = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<Request>();
  return parseIdempotencyKey(request.headers[IDEMPOTENCY_KEY_HEADER.toLowerCase()]);
});

/** Swagger documentation shared by every idempotent endpoint. */
export function ApiIdempotent(): MethodDecorator {
  return applyDecorators(
    ApiHeader({
      name: IDEMPOTENCY_KEY_HEADER,
      required: true,
      description:
        'Unique key per logical operation (UUID v4 recommended). Retrying with the same key ' +
        'and body returns the original response (with `Idempotent-Replayed: true`) without ' +
        'executing again. Reusing it with a different body returns 422.',
      schema: { type: 'string', example: '6f1c2a3e-8a4b-4c1d-9e2f-0a1b2c3d4e5f' },
    }),
    ApiResponse({
      status: 400,
      type: ProblemDetailsDto,
      description: 'VALIDATION_FAILED | IDEMPOTENCY_KEY_REQUIRED | IDEMPOTENCY_KEY_INVALID',
    }),
    ApiResponse({
      status: 422,
      type: ProblemDetailsDto,
      description: `IDEMPOTENCY_KEY_REUSED | business rule violations. Replays carry the ${IDEMPOTENT_REPLAYED_HEADER} header.`,
    }),
  );
}
