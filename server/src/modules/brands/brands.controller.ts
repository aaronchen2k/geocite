import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { BrandsService } from './brands.service';
import { CreateBrandDto, ListBrandDto, UpdateBrandDto } from './brands.dto';

@Controller('brands')
export class BrandsController {
  constructor(private readonly service: BrandsService) {}

  @Get()
  list(@Query() query: ListBrandDto) {
    return this.service.list(query);
  }

  @Post()
  create(@Body() dto: CreateBrandDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.detail(id);
  }

  @Patch(':id/default')
  setDefault(@Param('id', ParseIntPipe) id: number) {
    return this.service.setDefault(id);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateBrandDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
