import { Controller, Get, MessageEvent, Param, ParseIntPipe, Post, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { ExecutionDiagnosisService } from './execution-diagnosis.service';

@Controller()
export class ExecutionDiagnosisController {
  constructor(private readonly service: ExecutionDiagnosisService) {}

  @Post('brands/:brandId/execution-checks') create(@Param('brandId', ParseIntPipe) brandId: number) { return this.service.create(brandId); }
  @Get('brands/:brandId/execution-checks') list(@Param('brandId', ParseIntPipe) brandId: number) { return this.service.list(brandId); }
  @Get('brands/:brandId/execution-checks/:id') findOne(@Param('brandId', ParseIntPipe) brandId: number, @Param('id', ParseIntPipe) id: number) { return this.service.findOne(brandId, id); }
  @Post('brands/:brandId/execution-checks/:id/cancel') cancel(@Param('brandId', ParseIntPipe) brandId: number, @Param('id', ParseIntPipe) id: number) { return this.service.cancel(brandId, id); }
  @Sse('brands/:brandId/execution-checks/:id/events') events(@Param('brandId', ParseIntPipe) brandId: number, @Param('id', ParseIntPipe) id: number): Promise<Observable<MessageEvent>> { return this.service.events(brandId, id); }
}
