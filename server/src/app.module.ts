import { Controller, Get, Module, ValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dataSourceOptions } from './database/data-source';
import { BrandsModule } from './modules/brands/brands.module';

@Controller('health')
class HealthController {
  @Get()
  getHealth() {
    return { status: 'ok' as const };
  }
}

@Module({
  imports: [TypeOrmModule.forRoot(dataSourceOptions), BrandsModule],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    },
  ],
})
export class AppModule {}
