import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';

export const DEFAULT_PASSWORD = 'S3cure-passw0rd';

let sequence = 0;
export const uniqueEmail = (prefix = 'user') => `${prefix}.${Date.now()}.${++sequence}@example.com`;

/** Extracts the refresh cookie ("refresh_token=<value>") from a Set-Cookie header. */
export function refreshCookieFrom(res: request.Response): string | undefined {
  const header = res.headers['set-cookie'] as unknown as string[] | string | undefined;
  const cookies = Array.isArray(header) ? header : header ? [header] : [];
  const cookie = cookies.find((c) => c.startsWith('refresh_token='));
  return cookie?.split(';')[0];
}

export async function registerUser(
  app: INestApplication<App>,
  overrides: Partial<{ email: string; password: string; fullName: string }> = {},
) {
  const body = {
    email: uniqueEmail(),
    password: DEFAULT_PASSWORD,
    fullName: 'Test User',
    ...overrides,
  };
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send(body)
    .expect(201);
  return {
    ...body,
    accessToken: res.body.accessToken as string,
    userId: res.body.user.id as string,
    refreshCookie: refreshCookieFrom(res)!,
  };
}
