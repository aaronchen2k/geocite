import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { CreateEngineDto, ListEngineDto, UpdateEngineDto } from './engines.dto';
import { EnginesService } from './engines.service';
@Controller('engines')
export class EnginesController {
  constructor(private readonly service: EnginesService) {}
  @Get() list(@Query() query: ListEngineDto) { return this.service.list(query); }
  @Post() create(@Body() dto: CreateEngineDto) { return this.service.create(dto); }
  @Get(':id/web-review-status') webReviewStatus(@Param('id', ParseIntPipe) id: number) { return this.service.webReviewStatus(id); }
  @Post(':id/web-review/refresh') refreshWebReview(@Param('id', ParseIntPipe) id: number) { return this.service.refreshWebReview(id); }
  @Post(':id/web-review/reset') resetWebReview(@Param('id', ParseIntPipe) id: number) { return this.service.resetWebReview(id); }
  @Get(':id/web-review/page-structure') inspectWebReviewPage(@Param('id', ParseIntPipe) id: number) { return this.service.inspectWebReviewPage(id); }
  @Post('web-review/close-all') closeAllWebReviewWindows() { return this.service.closeAllWebReviewWindows(); }
  @Delete(':id/web-review-profile') deleteWebReviewProfile(@Param('id', ParseIntPipe) id: number) { return this.service.deleteWebReviewProfile(id); }
  @Get(':id') async findOne(@Param('id', ParseIntPipe) id: number) { return this.service.toResponse(await this.service.findOne(id)); }
  @Patch(':id') update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateEngineDto) { return this.service.update(id, dto); }
  @Delete(':id') remove(@Param('id', ParseIntPipe) id: number) { return this.service.remove(id); }
}
