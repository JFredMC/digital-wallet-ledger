import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { API_PREFIX, configureApp, DOCS_PATH } from './app.setup';
import type { Env } from './config/env.schema';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const port = config.get('PORT', { infer: true });
  await app.listen(port, '0.0.0.0');

  const logger = new Logger('Bootstrap');
  logger.log(`API listening on http://localhost:${port}/${API_PREFIX}`);
  if (config.get('SWAGGER_ENABLED', { infer: true })) {
    logger.log(`Swagger UI on http://localhost:${port}/${DOCS_PATH}`);
  }
}

void bootstrap();
