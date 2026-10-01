import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { DEFAULT_PASSWORD, refreshCookieFrom, registerUser, uniqueEmail } from '../utils/auth';
import { createTestApp, resetDatabase, type TestContext } from '../utils/test-app';

describe('Auth (e2e)', () => {
  let ctx: TestContext;
  const http = () => request(ctx.app.getHttpServer());

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.dataSource);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('POST /auth/register', () => {
    it('creates the user, returns an access token and sets a hardened refresh cookie', async () => {
      const email = uniqueEmail('Ana');
      const res = await http()
        .post('/api/v1/auth/register')
        .send({
          email: `  ${email.toUpperCase()} `,
          password: DEFAULT_PASSWORD,
          fullName: ' Ana Gómez ',
        })
        .expect(201);

      expect(res.body).toEqual({
        accessToken: expect.any(String),
        tokenType: 'Bearer',
        expiresIn: 900,
        user: {
          id: expect.any(String),
          email: email.toLowerCase(),
          fullName: 'Ana Gómez',
          role: 'USER',
          createdAt: expect.any(String),
        },
      });
      expect(JSON.stringify(res.body)).not.toMatch(/password|argon2/i);

      const setCookie = (res.headers['set-cookie'] as unknown as string[]).join(';');
      expect(setCookie).toMatch(/refresh_token=[\w-]{43}/);
      expect(setCookie).toMatch(/HttpOnly/);
      expect(setCookie).toMatch(/Secure/);
      expect(setCookie).toMatch(/SameSite=Strict/);
      expect(setCookie).toMatch(/Path=\/api\/v1\/auth/);

      const [row] = await ctx.dataSource.query('SELECT password_hash FROM users WHERE email = $1', [
        email,
      ]);
      expect(row.password_hash).toMatch(/^\$argon2id\$/);
    });

    it('rejects a duplicate email (case-insensitive) with 409', async () => {
      const { email } = await registerUser(ctx.app);
      const res = await http()
        .post('/api/v1/auth/register')
        .send({ email: email.toUpperCase(), password: DEFAULT_PASSWORD, fullName: 'Copy Cat' })
        .expect(409);
      expect(res.body.code).toBe('EMAIL_ALREADY_REGISTERED');
    });

    it('validates the payload and rejects unknown properties', async () => {
      const res = await http()
        .post('/api/v1/auth/register')
        .send({ email: 'not-an-email', password: 'short', fullName: 'A', role: 'ADMIN' })
        .expect(400);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          'property role should not exist',
          'email must be an email',
          expect.stringContaining('password must be longer'),
          'password must contain at least one number',
        ]),
      );
    });
  });

  describe('POST /auth/login', () => {
    it('logs in with valid credentials', async () => {
      const { email } = await registerUser(ctx.app);
      const res = await http()
        .post('/api/v1/auth/login')
        .send({ email, password: DEFAULT_PASSWORD })
        .expect(200);
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(refreshCookieFrom(res)).toBeDefined();
    });

    it('returns the same generic 401 for a wrong password and an unknown email', async () => {
      const { email } = await registerUser(ctx.app);
      const wrongPassword = await http()
        .post('/api/v1/auth/login')
        .send({ email, password: 'Wrong-passw0rd' })
        .expect(401);
      const unknownEmail = await http()
        .post('/api/v1/auth/login')
        .send({ email: uniqueEmail('ghost'), password: 'Wrong-passw0rd' })
        .expect(401);

      for (const res of [wrongPassword, unknownEmail]) {
        expect(res.body).toMatchObject({
          code: 'INVALID_CREDENTIALS',
          detail: 'Email or password is incorrect.',
        });
        expect(refreshCookieFrom(res)).toBeUndefined();
      }
    });

    it('temporarily locks the account after 5 failed attempts', async () => {
      const { email } = await registerUser(ctx.app);
      for (let i = 0; i < 5; i++) {
        await http()
          .post('/api/v1/auth/login')
          .send({ email, password: 'Wrong-passw0rd' })
          .expect(401);
      }
      // Correct password is rejected while locked, with the same generic error.
      const locked = await http()
        .post('/api/v1/auth/login')
        .send({ email, password: DEFAULT_PASSWORD })
        .expect(401);
      expect(locked.body.code).toBe('INVALID_CREDENTIALS');

      // Once the lock expires the user can log in again and the counter resets.
      await ctx.dataSource.query(
        `UPDATE users SET locked_until = now() - interval '1 second' WHERE email = $1`,
        [email],
      );
      await http()
        .post('/api/v1/auth/login')
        .send({ email, password: DEFAULT_PASSWORD })
        .expect(200);
      const [row] = await ctx.dataSource.query(
        'SELECT failed_login_attempts, locked_until FROM users WHERE email = $1',
        [email],
      );
      expect(row).toEqual({ failed_login_attempts: 0, locked_until: null });
    });
  });

  describe('GET /auth/me', () => {
    it('returns the profile for a valid access token', async () => {
      const user = await registerUser(ctx.app);
      const res = await http()
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);
      expect(res.body).toMatchObject({ id: user.userId, email: user.email });
    });

    it('rejects missing, malformed and tampered tokens', async () => {
      const { accessToken } = await registerUser(ctx.app);
      await http().get('/api/v1/auth/me').expect(401);
      await http().get('/api/v1/auth/me').set('Authorization', 'Bearer not-a-jwt').expect(401);
      await http()
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken.slice(0, -2)}xx`)
        .expect(401);
    });

    it('rejects an expired access token', async () => {
      const { userId } = await registerUser(ctx.app);
      const jwt = ctx.app.get(JwtService);
      const expired = await jwt.signAsync({ sub: userId, role: 'USER' }, { expiresIn: -10 });
      const res = await http()
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${expired}`)
        .expect(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('rejects a token signed with another secret', async () => {
      const { userId } = await registerUser(ctx.app);
      const forged = await new JwtService().signAsync(
        { sub: userId, role: 'ADMIN' },
        {
          secret: 'attacker-secret-attacker-secret-attacker',
          issuer: 'digital-wallet-ledger',
          audience: 'digital-wallet-ledger',
        },
      );
      await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${forged}`).expect(401);
    });
  });

  describe('POST /auth/refresh', () => {
    it('rotates the refresh token: the new one works, the old one is single-use', async () => {
      const { refreshCookie: first } = await registerUser(ctx.app);

      const rotated = await http().post('/api/v1/auth/refresh').set('Cookie', first).expect(200);
      const second = refreshCookieFrom(rotated)!;
      expect(rotated.body.accessToken).toEqual(expect.any(String));
      expect(second).toBeDefined();
      expect(second).not.toBe(first);

      await http()
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${rotated.body.accessToken}`)
        .expect(200);

      const third = refreshCookieFrom(
        await http().post('/api/v1/auth/refresh').set('Cookie', second).expect(200),
      )!;
      expect(third).toBeDefined();
    });

    it('detects reuse of a rotated token and revokes the whole family', async () => {
      const { refreshCookie: first, userId } = await registerUser(ctx.app);
      const second = refreshCookieFrom(
        await http().post('/api/v1/auth/refresh').set('Cookie', first).expect(200),
      )!;

      // Attacker replays the old token.
      const reuse = await http().post('/api/v1/auth/refresh').set('Cookie', first).expect(401);
      expect(reuse.body.code).toBe('REFRESH_TOKEN_REUSED');
      expect((reuse.headers['set-cookie'] as unknown as string[]).join(';')).toMatch(
        /refresh_token=;/,
      );

      // The legitimate (newest) token is now revoked too.
      const legit = await http().post('/api/v1/auth/refresh').set('Cookie', second).expect(401);
      expect(legit.body.code).toBe('REFRESH_TOKEN_REUSED');

      const [{ active }] = await ctx.dataSource.query(
        'SELECT count(*)::int AS active FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL',
        [userId],
      );
      expect(active).toBe(0);
    });

    it('only lets one of two concurrent refreshes with the same token succeed', async () => {
      const { refreshCookie } = await registerUser(ctx.app);
      const results = await Promise.all([
        http().post('/api/v1/auth/refresh').set('Cookie', refreshCookie),
        http().post('/api/v1/auth/refresh').set('Cookie', refreshCookie),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
    });

    it('returns 401 without a cookie or with an unknown token', async () => {
      const none = await http().post('/api/v1/auth/refresh').expect(401);
      expect(none.body.code).toBe('INVALID_REFRESH_TOKEN');
      const unknown = await http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', 'refresh_token=unknown-token-value')
        .expect(401);
      expect(unknown.body.code).toBe('INVALID_REFRESH_TOKEN');
    });

    it('rejects an expired refresh token', async () => {
      const { refreshCookie, userId } = await registerUser(ctx.app);
      await ctx.dataSource.query(
        `UPDATE refresh_tokens SET expires_at = now() - interval '1 minute' WHERE user_id = $1`,
        [userId],
      );
      const res = await http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', refreshCookie)
        .expect(401);
      expect(res.body.code).toBe('INVALID_REFRESH_TOKEN');
    });

    it('rejects requests from an untrusted Origin (CSRF defence)', async () => {
      const { refreshCookie } = await registerUser(ctx.app);
      const res = await http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', refreshCookie)
        .set('Origin', 'https://evil.example')
        .expect(403);
      expect(res.body.code).toBe('UNTRUSTED_ORIGIN');

      await http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', refreshCookie)
        .set('Origin', 'http://localhost:4200')
        .expect(200);
    });
  });

  describe('POST /auth/logout', () => {
    it('revokes the current refresh token and clears the cookie', async () => {
      const { refreshCookie } = await registerUser(ctx.app);
      const res = await http().post('/api/v1/auth/logout').set('Cookie', refreshCookie).expect(204);
      expect((res.headers['set-cookie'] as unknown as string[]).join(';')).toMatch(
        /refresh_token=;.*Path=\/api\/v1\/auth/,
      );

      const after = await http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', refreshCookie)
        .expect(401);
      expect(after.body.code).toBe('REFRESH_TOKEN_REUSED');
    });

    it('is idempotent without a cookie', async () => {
      await http().post('/api/v1/auth/logout').expect(204);
    });
  });
});
