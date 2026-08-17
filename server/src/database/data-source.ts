import { DataSource, type DataSourceOptions } from 'typeorm';
import { BrandEntity } from '../modules/brands/brand.entity';
import { BrandEngineEntity } from '../modules/brands/brand-engine.entity';
import { EngineEntity } from '../modules/engines/engine.entity';
import { ModelEntity } from '../modules/models/model.entity';
import { RagAgentEntity } from '../modules/rag-agents/rag-agent.entity';
import { BrandDiagnosisQuestionEntity, ExecutionDiagnosisEventEntity, ExecutionDiagnosisPageEntity, ExecutionDiagnosisProbeEntity, ExecutionDiagnosisRunEntity, ExecutionDiagnosisSampleEntity, ExecutionDiagnosisStepEntity, ExecutionDiagnosisWebReviewEntity } from '../modules/execution-diagnosis/execution-diagnosis.entity';
import { CompetitorEntity } from '../modules/competitors/competitor.entity';
import { AttributionRecordEntity, ComparisonExperimentEntity, DiagnosisComparisonEntity, DiagnosisFindingEntity, OptimizationActionEntity, OptimizationWorkOrderEntity, OptimizationWorkOrderTransitionEntity, PeriodicRetestPlanEntity } from '../modules/execution-diagnosis/optimization-verification.entity';
import { EngineBrowserLaunchEntity, EngineWebReviewProfileEntity } from '../modules/execution-diagnosis/web-review.entity';
import { DiagnosisQuestionTaxonomyEntity } from '../modules/execution-diagnosis/question-taxonomy.entity';

export const dataSourceOptions: DataSourceOptions = {
  type: 'sqlite',
  database: process.env.NODE_ENV === 'test' ? ':memory:' : 'data/geocite.sqlite',
  entities: [BrandEntity, BrandEngineEntity, EngineEntity, ModelEntity, RagAgentEntity, CompetitorEntity, BrandDiagnosisQuestionEntity, DiagnosisQuestionTaxonomyEntity, ExecutionDiagnosisRunEntity, ExecutionDiagnosisStepEntity, ExecutionDiagnosisEventEntity, ExecutionDiagnosisPageEntity, ExecutionDiagnosisProbeEntity, ExecutionDiagnosisSampleEntity, ExecutionDiagnosisWebReviewEntity, DiagnosisFindingEntity, OptimizationWorkOrderEntity, OptimizationWorkOrderTransitionEntity, OptimizationActionEntity, DiagnosisComparisonEntity, AttributionRecordEntity, PeriodicRetestPlanEntity, ComparisonExperimentEntity, EngineWebReviewProfileEntity, EngineBrowserLaunchEntity],
  synchronize: true,
};

export const appDataSource = new DataSource(dataSourceOptions);
