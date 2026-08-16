import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put } from '@nestjs/common';
import { CompareDiagnosisRunsDto, CreateAttributionDto, CreateComparisonExperimentDto, CreateOptimizationActionDto, CreateOptimizationWorkOrderDto, CreatePeriodicRetestPlanDto, EvaluateComparisonExperimentDto, TransitionOptimizationWorkOrderDto, UpdatePeriodicRetestPlanDto } from './optimization-verification.dto';
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

  @Get('verification/attributions') listAttributions(@Param('brandId', ParseIntPipe) brandId: number) { return this.service.listAttributions(brandId); }
  @Post('verification/attributions') createAttribution(@Param('brandId', ParseIntPipe) brandId: number, @Body() dto: CreateAttributionDto) { return this.service.createAttribution(brandId, dto); }
  @Post('verification/comparisons/:id/possible-attributions') suggestAttributions(@Param('brandId', ParseIntPipe) brandId: number, @Param('id', ParseIntPipe) id: number) { return this.service.suggestPossibleAttributions(brandId, id); }

  @Get('verification/periodic-retests') listRetestPlans(@Param('brandId', ParseIntPipe) brandId: number) { return this.service.listPeriodicRetestPlans(brandId); }
  @Post('verification/periodic-retests') createRetestPlan(@Param('brandId', ParseIntPipe) brandId: number, @Body() dto: CreatePeriodicRetestPlanDto) { return this.service.createPeriodicRetestPlan(brandId, dto); }
  @Patch('verification/periodic-retests/:id') updateRetestPlan(@Param('brandId', ParseIntPipe) brandId: number, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePeriodicRetestPlanDto) { return this.service.updatePeriodicRetestPlan(brandId, id, dto); }
  @Post('verification/periodic-retests/:id/trigger') triggerRetest(@Param('brandId', ParseIntPipe) brandId: number, @Param('id', ParseIntPipe) id: number) { return this.service.triggerPeriodicRetest(brandId, id); }

  @Get('verification/comparison-experiments') listExperiments(@Param('brandId', ParseIntPipe) brandId: number) { return this.service.listComparisonExperiments(brandId); }
  @Post('verification/comparison-experiments') createExperiment(@Param('brandId', ParseIntPipe) brandId: number, @Body() dto: CreateComparisonExperimentDto) { return this.service.createComparisonExperiment(brandId, dto); }
  @Put('verification/comparison-experiments/:id') replaceExperiment(@Param('brandId', ParseIntPipe) brandId: number, @Param('id', ParseIntPipe) id: number, @Body() dto: CreateComparisonExperimentDto) { return this.service.replaceComparisonExperiment(brandId, id, dto); }
  @Post('verification/comparison-experiments/:id/evaluate') evaluateExperiment(@Param('brandId', ParseIntPipe) brandId: number, @Param('id', ParseIntPipe) id: number, @Body() dto: EvaluateComparisonExperimentDto) { return this.service.evaluateExperiment(brandId, id, dto); }
}
