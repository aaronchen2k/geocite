import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadRuntimeConfig } from './config/runtime-config';

async function bootstrap() {
  const config = loadRuntimeConfig();
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix(config.apiPrefix);
  await app.listen(config.port, config.host);
}

void bootstrap();
