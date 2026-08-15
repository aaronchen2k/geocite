import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BrandEntity } from '../brands/brand.entity';
import { BrandEngineEntity } from '../brands/brand-engine.entity';
import { EngineEntity } from '../engines/engine.entity';
import { ModelEntity } from '../models/model.entity';
import { ExecutionDiagnosisController } from './execution-diagnosis.controller';
import { DiagnosisConfigurationController } from './diagnosis-configuration.controller';
import { DiagnosisConfigurationService } from './diagnosis-configuration.service';
import { BrandDiagnosisQuestionEntity, ExecutionDiagnosisEventEntity, ExecutionDiagnosisPageEntity, ExecutionDiagnosisProbeEntity, ExecutionDiagnosisRunEntity, ExecutionDiagnosisSampleEntity, ExecutionDiagnosisStepEntity } from './execution-diagnosis.entity';
import { ExecutionDiagnosisService } from './execution-diagnosis.service';

@Module({ imports: [TypeOrmModule.forFeature([BrandEntity, BrandEngineEntity, EngineEntity, ModelEntity, BrandDiagnosisQuestionEntity, ExecutionDiagnosisRunEntity, ExecutionDiagnosisStepEntity, ExecutionDiagnosisEventEntity, ExecutionDiagnosisPageEntity, ExecutionDiagnosisProbeEntity, ExecutionDiagnosisSampleEntity])], controllers: [ExecutionDiagnosisController, DiagnosisConfigurationController], providers: [ExecutionDiagnosisService, DiagnosisConfigurationService] })
export class ExecutionDiagnosisModule {}
