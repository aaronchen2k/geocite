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
import { DiagnosisInsightsService } from './diagnosis-insights.service';
import { DiagnosisInsightsController } from './diagnosis-insights.controller';
import { CompetitorEntity } from '../competitors/competitor.entity';
import { AttributionRecordEntity, ComparisonExperimentEntity, DiagnosisComparisonEntity, DiagnosisFindingEntity, OptimizationActionEntity, OptimizationWorkOrderEntity, OptimizationWorkOrderTransitionEntity, PeriodicRetestPlanEntity } from './optimization-verification.entity';
import { OptimizationVerificationController } from './optimization-verification.controller';
import { OptimizationVerificationService } from './optimization-verification.service';

@Module({ imports: [TypeOrmModule.forFeature([BrandEntity, BrandEngineEntity, EngineEntity, ModelEntity, CompetitorEntity, BrandDiagnosisQuestionEntity, ExecutionDiagnosisRunEntity, ExecutionDiagnosisStepEntity, ExecutionDiagnosisEventEntity, ExecutionDiagnosisPageEntity, ExecutionDiagnosisProbeEntity, ExecutionDiagnosisSampleEntity, DiagnosisFindingEntity, OptimizationWorkOrderEntity, OptimizationWorkOrderTransitionEntity, OptimizationActionEntity, DiagnosisComparisonEntity, AttributionRecordEntity, PeriodicRetestPlanEntity, ComparisonExperimentEntity])], controllers: [ExecutionDiagnosisController, DiagnosisConfigurationController, DiagnosisInsightsController, OptimizationVerificationController], providers: [ExecutionDiagnosisService, DiagnosisConfigurationService, DiagnosisInsightsService, OptimizationVerificationService] })
export class ExecutionDiagnosisModule {}
