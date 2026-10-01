import { ArgumentsHost, BadRequestException, NotFoundException } from '@nestjs/common';
import { DomainError } from '../errors/domain-error';
import { ProblemDetailsFilter } from './problem-details.filter';

function createHost() {
  const res = {
    status: jest.fn().mockReturnThis(),
    type: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const req = {
    method: 'POST',
    originalUrl: '/api/v1/auth/login?x=1',
    header: jest.fn().mockReturnValue('req-12345678'),
  };
  const host = {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ArgumentsHost;
  return { host, res };
}

describe('ProblemDetailsFilter', () => {
  const filter = new ProblemDetailsFilter();

  it('renders a DomainError with its catalogue status and code', () => {
    const { host, res } = createHost();
    filter.catch(new DomainError('INVALID_CREDENTIALS', 'Email or password is incorrect.'), host);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.type).toHaveBeenCalledWith('application/problem+json');
    expect(res.json).toHaveBeenCalledWith({
      type: 'https://errors.wallet.dev/invalid-credentials',
      title: 'Invalid credentials',
      status: 401,
      code: 'INVALID_CREDENTIALS',
      detail: 'Email or password is incorrect.',
      instance: '/api/v1/auth/login',
      requestId: 'req-12345678',
    });
  });

  it('maps ValidationPipe errors to VALIDATION_FAILED with the list of errors', () => {
    const { host, res } = createHost();
    filter.catch(new BadRequestException(['email must be an email']), host);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'VALIDATION_FAILED', errors: ['email must be an email'] }),
    );
  });

  it('maps other HttpExceptions using the HTTP status name', () => {
    const { host, res } = createHost();
    filter.catch(new NotFoundException('Cannot GET /nope'), host);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 404, code: 'NOT_FOUND', title: 'Not found' }),
    );
  });

  it('hides details of unexpected errors', () => {
    const { host, res } = createHost();
    jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
    filter.catch(new Error('db password is hunter2'), host);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INTERNAL_ERROR', detail: 'An unexpected error occurred.' }),
    );
  });
});
