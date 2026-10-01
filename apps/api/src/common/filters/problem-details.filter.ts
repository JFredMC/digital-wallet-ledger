import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { DomainError } from '../errors/domain-error';
import { REQUEST_ID_HEADER } from '../middleware/request-id.middleware';
import type { ProblemDetailsDto } from './problem-details.dto';

const ERROR_TYPE_BASE = 'https://errors.wallet.dev/';

const toKebab = (code: string) => code.toLowerCase().replace(/_/g, '-');

interface NormalizedError {
  status: number;
  code: string;
  title: string;
  detail: string;
  errors?: string[];
  extensions?: Record<string, unknown>;
}

/** Renders every error as RFC 9457 `application/problem+json`. */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const error = this.normalize(exception);
    const requestId = req.header(REQUEST_ID_HEADER) ?? '';

    if (error.status >= 500) {
      this.logger.error(
        `${req.method} ${req.originalUrl} failed [requestId=${requestId}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ProblemDetailsDto & Record<string, unknown> = {
      type: `${ERROR_TYPE_BASE}${toKebab(error.code)}`,
      title: error.title,
      status: error.status,
      code: error.code,
      detail: error.detail,
      instance: req.originalUrl.split('?')[0],
      requestId,
      ...(error.errors ? { errors: error.errors } : {}),
      ...error.extensions,
    };

    res.status(error.status).type('application/problem+json').json(body);
  }

  private normalize(exception: unknown): NormalizedError {
    if (exception instanceof DomainError) {
      return {
        status: exception.status,
        code: exception.code,
        title: exception.title,
        detail: exception.message,
        extensions: exception.extensions,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const statusName = (HttpStatus[status] as string | undefined) ?? 'ERROR';
      const title = statusName
        .toLowerCase()
        .replace(/_/g, ' ')
        .replace(/^\w/, (c) => c.toUpperCase());
      const message =
        typeof response === 'object' && response !== null && 'message' in response
          ? response.message
          : exception.message;

      // class-validator errors from the global ValidationPipe arrive as string[].
      if (status === 400 && Array.isArray(message)) {
        return {
          status,
          code: 'VALIDATION_FAILED',
          title: 'Validation failed',
          detail: 'The request body or parameters are invalid.',
          errors: message.map(String),
        };
      }

      return {
        status,
        code: statusName,
        title,
        detail: typeof message === 'string' ? message : title,
      };
    }

    return {
      status: 500,
      code: 'INTERNAL_ERROR',
      title: 'Internal server error',
      detail: 'An unexpected error occurred.',
    };
  }
}
