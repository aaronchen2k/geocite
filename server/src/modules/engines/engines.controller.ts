import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { CreateEngineDto, ListEngineDto, UpdateEngineDto } from './engines.dto';
import { EnginesService } from './engines.service';
@Controller('engines')
export class EnginesController {
  constructor(private readonly service: EnginesService) {}
  @Get() async list(@Query() query: ListEngineDto) { const result = await this.service.list(query); return { ...result, items: result.items.map((item) => this.service.toResponse(item)) }; }
  @Post() create(@Body() dto: CreateEngineDto) { return this.service.create(dto); }
  @Get(':id') async findOne(@Param('id', ParseIntPipe) id: number) { return this.service.toResponse(await this.service.findOne(id)); }
  @Patch(':id') update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateEngineDto) { return this.service.update(id, dto); }
  @Delete(':id') remove(@Param('id', ParseIntPipe) id: number) { return this.service.remove(id); }
}
