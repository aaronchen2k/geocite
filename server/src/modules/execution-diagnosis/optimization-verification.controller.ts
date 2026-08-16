import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { CreateOptimizationActionDto, CreateOptimizationWorkOrderDto, TransitionOptimizationWorkOrderDto } from './optimization-verification.dto';
import { OptimizationVerificationService } from './optimization-verification.service';

@Controller('brands/:brandId/optimization-work-orders')
export class OptimizationVerificationController {
  constructor(private readonly service: OptimizationVerificationService) {}

  @Get() list(@Param('brandId', ParseIntPipe) brandId: number) { return this.service.listWorkOrders(brandId); }
  @Post() create(@Param('brandId', ParseIntPipe) brandId: number, @Body() dto: CreateOptimizationWorkOrderDto) { return this.service.createWorkOrder(brandId, dto); }
  @Patch(':id') transition(@Param('brandId', ParseIntPipe) brandId: number, @Param('id', ParseIntPipe) id: number, @Body() dto: TransitionOptimizationWorkOrderDto) { return this.service.transitionWorkOrder(brandId, id, dto); }
  @Post(':id/actions') addAction(@Param('brandId', ParseIntPipe) brandId: number, @Param('id', ParseIntPipe) id: number, @Body() dto: CreateOptimizationActionDto) { return this.service.addAction(brandId, id, dto); }
}
