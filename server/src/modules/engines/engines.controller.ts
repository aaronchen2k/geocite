import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { CreateEngineDto, UpdateEngineDto } from './engines.dto';
import { EnginesService } from './engines.service';
@Controller('engines')
export class EnginesController {
  constructor(private readonly service: EnginesService) {}
  @Get() list() { return this.service.list(); }
  @Post() create(@Body() dto: CreateEngineDto) { return this.service.create(dto); }
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) { return this.service.findOne(id); }
  @Patch(':id') update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateEngineDto) { return this.service.update(id, dto); }
  @Delete(':id') remove(@Param('id', ParseIntPipe) id: number) { return this.service.remove(id); }
}
