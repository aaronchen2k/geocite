import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BrandEntity } from './brand.entity';
import { BrandEngineEntity } from './brand-engine.entity';
import { EngineEntity } from '../engines/engine.entity';
import { BrandsController } from './brands.controller';
import { BrandsService } from './brands.service';

@Module({
  imports: [TypeOrmModule.forFeature([BrandEntity, BrandEngineEntity, EngineEntity])],
  controllers: [BrandsController],
  providers: [BrandsService],
})
export class BrandsModule {}
