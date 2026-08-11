import { Controller, Get, Module, ValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dataSourceOptions } from './database/data-source';
import { BrandsModule } from './modules/brands/brands.module';
import { EnginesModule } from './modules/engines/engines.module';
import { ModelsModule } from './modules/models/models.module';
import { RagAgentsModule } from './modules/rag-agents/rag-agents.module';

@Controller('health')
class HealthController {
  @Get()
  getHealth() {
    return { status: 'ok' as const };
  }
}

@Module({
  imports: [TypeOrmModule.forRoot(dataSourceOptions), BrandsModule, EnginesModule, ModelsModule, RagAgentsModule],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    },
  ],
})
export class AppModule {}
