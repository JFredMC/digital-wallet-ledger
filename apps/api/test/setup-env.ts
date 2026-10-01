// Defaults for e2e runs. Real environment variables (e.g. from CI) take precedence.
process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgres://wallet:wallet@localhost:5432/wallet';
process.env.DATABASE_MIGRATIONS_RUN ??= 'true';
process.env.JWT_ACCESS_SECRET ??= 'e2e-test-secret-that-is-at-least-32-characters-long';
process.env.COOKIE_SECURE ??= 'true';
process.env.CORS_ORIGINS ??= 'http://localhost:4200';
