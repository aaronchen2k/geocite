import { Controller, Get, Module } from '@nestjs/common';

@Controller('health')
class HealthController {
  @Get()
  getHealth() {
    return { status: 'ok' as const };
  }
}

@Module({ controllers: [HealthController] })
export class AppModule {}
