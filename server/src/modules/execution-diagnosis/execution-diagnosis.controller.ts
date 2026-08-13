import { Controller, Get, MessageEvent, NotFoundException, Param, ParseIntPipe, Post, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { ExecutionDiagnosisService } from './execution-diagnosis.service';

@Controller()
export class ExecutionDiagnosisController {
  constructor(private readonly service: ExecutionDiagnosisService) {}

  @Post('brands/:brandId/execution-checks') create(@Param('brandId', ParseIntPipe) brandId: number) { return this.service.create(brandId); }
  @Get('brands/:brandId/execution-checks') list(@Param('brandId', ParseIntPipe) brandId: number) { return this.service.list(brandId); }
  @Get('execution-checks/:id') findOne(@Param('id', ParseIntPipe) id: number) { return this.service.findOne(id); }
  @Post('execution-checks/:id/cancel') cancel(@Param('id', ParseIntPipe) id: number) { return this.service.cancel(id); }
  @Sse('execution-checks/:id/events') events(@Param('id', ParseIntPipe) id: number): Observable<MessageEvent> {
    const stream = this.service.events(id);
    if (!stream) throw new NotFoundException(`执行诊断 ${id} 不存在`);
    return stream;
  }
}
