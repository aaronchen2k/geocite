import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { DiagnosisInsightsService } from './diagnosis-insights.service';
import { ReviewSampleDto } from './diagnosis-insights.dto';

@Controller('brands/:brandId/diagnosis-insights')
export class DiagnosisInsightsController {
  constructor(private readonly service: DiagnosisInsightsService) {}
  @Get('latest') latest(@Param('brandId', ParseIntPipe) brandId: number) { return this.service.latest(brandId); }
  @Get('runs/:runId') run(@Param('brandId', ParseIntPipe) brandId: number, @Param('runId', ParseIntPipe) runId: number) { return this.service.forRun(brandId, runId); }
  @Post('latest/recalculate') recalculate(@Param('brandId', ParseIntPipe) brandId: number) { return this.service.recalculateLatest(brandId); }
  @Patch('samples/:sampleId/review') review(@Param('brandId', ParseIntPipe) brandId: number, @Param('sampleId', ParseIntPipe) sampleId: number, @Body() dto: ReviewSampleDto) { return this.service.reviewSample(brandId, sampleId, dto); }
}
