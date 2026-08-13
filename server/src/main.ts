import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { corsOptions } from './config/cors';
import { loadRuntimeConfig } from './config/runtime-config';
import { appLogger, logInboundRequest, logInboundResponse, PinoNestLogger } from './logging/pino-logger';

async function bootstrap() {
  const config = loadRuntimeConfig();
  const app = await NestFactory.create(AppModule, { logger: new PinoNestLogger() });
  app.enableCors(corsOptions);
  app.setGlobalPrefix(config.apiPrefix);
  app.use((request: any, response: any, next: () => void) => {
    const startedAt = Date.now();
    const target = `${request.method} ${request.originalUrl ?? request.url}`;
    logInboundRequest({ method: request.method, url: request.originalUrl ?? request.url, ip: request.ip, userAgent: request.headers?.['user-agent'], headers: request.headers, body: request.body });
    response.on('finish', () => logInboundResponse({ target, statusCode: response.statusCode, durationMs: Date.now() - startedAt }));
    request.on('aborted', () => appLogger.warn({ target, durationMs: Date.now() - startedAt }, 'incoming request aborted'));
    next();
  });
  await app.listen(config.port, config.host);
  appLogger.info({ host: config.host, port: config.port, apiPrefix: config.apiPrefix }, 'server started');
}

void bootstrap().catch((error) => { appLogger.fatal({ error }, 'server startup failed'); });
