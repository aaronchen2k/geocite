import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { CompareDiagnosisRunsDto, CreateOptimizationActionDto, CreateOptimizationWorkOrderDto, TransitionOptimizationWorkOrderDto } from './optimization-verification.dto';
import { OptimizationVerificationService } from './optimization-verification.service';

@Controller('brands/:brandId')
export class OptimizationVerificationController {
  constructor(private readonly service: OptimizationVerificationService) {}

  @Get('optimization-work-orders') list(@Param('brandId', ParseIntPipe) brandId: number) { return this.service.listWorkOrders(brandId); }
  @Post('optimization-work-orders') create(@Param('brandId', ParseIntPipe) brandId: number, @Body() dto: CreateOptimizationWorkOrderDto) { return this.service.createWorkOrder(brandId, dto); }
  @Patch('optimization-work-orders/:id') transition(@Param('brandId', ParseIntPipe) brandId: number, @Param('id', ParseIntPipe) id: number, @Body() dto: TransitionOptimizationWorkOrderDto) { return this.service.transitionWorkOrder(brandId, id, dto); }
  @Post('optimization-work-orders/:id/actions') addAction(@Param('brandId', ParseIntPipe) brandId: number, @Param('id', ParseIntPipe) id: number, @Body() dto: CreateOptimizationActionDto) { return this.service.addAction(brandId, id, dto); }

  @Get('verification/trend') trend(@Param('brandId', ParseIntPipe) brandId: number) { return this.service.visibilityTrend(brandId); }
  @Get('verification/questions') questions(@Param('brandId', ParseIntPipe) brandId: number) { return this.service.questionTracking(brandId); }
  @Post('verification/comparisons') compare(@Param('brandId', ParseIntPipe) brandId: number, @Body() dto: CompareDiagnosisRunsDto) { return this.service.compareRuns(brandId, dto.baselineRunId, dto.retestRunId); }
}
