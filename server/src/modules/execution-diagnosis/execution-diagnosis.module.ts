import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BrandEntity } from '../brands/brand.entity';
import { BrandEngineEntity } from '../brands/brand-engine.entity';
import { EngineEntity } from '../engines/engine.entity';
import { ExecutionDiagnosisController } from './execution-diagnosis.controller';
import { ExecutionDiagnosisEventEntity, ExecutionDiagnosisRunEntity, ExecutionDiagnosisStepEntity } from './execution-diagnosis.entity';
import { ExecutionDiagnosisService } from './execution-diagnosis.service';

@Module({ imports: [TypeOrmModule.forFeature([BrandEntity, BrandEngineEntity, EngineEntity, ExecutionDiagnosisRunEntity, ExecutionDiagnosisStepEntity, ExecutionDiagnosisEventEntity])], controllers: [ExecutionDiagnosisController], providers: [ExecutionDiagnosisService] })
export class ExecutionDiagnosisModule {}
