import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { corsOptions } from './config/cors';
import { loadRuntimeConfig } from './config/runtime-config';
import { LocalTimeLogger } from './logging/local-time';

async function bootstrap() {
  const config = loadRuntimeConfig();
  const app = await NestFactory.create(AppModule, { logger: new LocalTimeLogger() });
  app.enableCors(corsOptions);
  app.setGlobalPrefix(config.apiPrefix);
  await app.listen(config.port, config.host);
}

void bootstrap().catch((error) => new LocalTimeLogger().error(error));
