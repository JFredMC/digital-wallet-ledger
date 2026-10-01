import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { DomainError } from '../../../common/errors/domain-error';
import type { Env } from '../../../config/env.schema';

/**
 * CSRF defence-in-depth for cookie-authenticated endpoints (refresh/logout),
 * on top of SameSite=Strict: when the browser sends an Origin header it must be
 * an allowed origin or the API's own origin.
 */
@Injectable()
export class TrustedOriginGuard implements CanActivate {
  constructor(private readonly config: ConfigService<Env, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const origin = req.header('origin');
    if (!origin) return true; // non-browser clients

    const ownOrigin = `${req.protocol}://${req.get('host')}`;
    const allowed = this.config.get('CORS_ORIGINS', { infer: true });
    if (origin === ownOrigin || allowed.includes(origin)) return true;

    throw new DomainError('UNTRUSTED_ORIGIN', 'Request origin is not allowed.');
  }
}
