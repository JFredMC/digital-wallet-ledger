import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';
import type { Env } from './config/env.schema';
import { REFRESH_COOKIE_NAME } from './modules/auth/auth.constants';

export const API_PREFIX = 'api/v1';
export const DOCS_PATH = 'api/docs';

/** Shared HTTP setup for main.ts and e2e tests so both behave the same. */
export function configureApp(app: INestApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  if (config.get('TRUST_PROXY', { infer: true })) {
    // Behind nginx / Render: trust the first proxy for req.ip and req.protocol.
    (app as NestExpressApplication).set('trust proxy', 1);
  }

  app.use(requestIdMiddleware);
  app.use(
    helmet({
      // HTTPS is enforced by the platform (and HSTS); upgrading sub-requests would break
      // Swagger UI when the API is served over plain http (local / docker compose).
      contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } },
    }),
  );
  app.use(cookieParser());
  app.enableCors({
    origin: config.get('CORS_ORIGINS', { infer: true }),
    credentials: true,
    exposedHeaders: ['X-Request-Id'],
  });
  app.setGlobalPrefix(API_PREFIX);
  app.enableShutdownHooks();

  if (config.get('SWAGGER_ENABLED', { infer: true })) {
    setupSwagger(app);
  }
}

function setupSwagger(app: INestApplication): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Digital Wallet Ledger API')
      .setDescription(
        'Digital wallet with a double-entry ledger, idempotent P2P transfers and JWT auth. ' +
          'Amounts are integers in minor units (`amountMinor`). Errors follow RFC 9457 ' +
          '(`application/problem+json`) with a stable `code`.',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .addCookieAuth(REFRESH_COOKIE_NAME)
      .build(),
  );
  SwaggerModule.setup(DOCS_PATH, app, document, {
    jsonDocumentUrl: `${DOCS_PATH}-json`,
    customSiteTitle: 'Digital Wallet Ledger API',
    swaggerOptions: { persistAuthorization: true },
  });
}
