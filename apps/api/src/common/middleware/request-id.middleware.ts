import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';
const SAFE_REQUEST_ID = /^[\w-]{8,128}$/;

/** Propagates a caller-supplied X-Request-Id (if well-formed) or generates one. */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header(REQUEST_ID_HEADER);
  const requestId = incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  req.headers[REQUEST_ID_HEADER] = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}
