import { DataSource, type DataSourceOptions } from 'typeorm';
import { BrandEntity } from '../modules/brands/brand.entity';
import { BrandEngineEntity } from '../modules/brands/brand-engine.entity';
import { EngineEntity } from '../modules/engines/engine.entity';
import { ModelEntity } from '../modules/models/model.entity';
import { RagAgentEntity } from '../modules/rag-agents/rag-agent.entity';
import { ExecutionDiagnosisEventEntity, ExecutionDiagnosisPageEntity, ExecutionDiagnosisProbeEntity, ExecutionDiagnosisRunEntity, ExecutionDiagnosisSampleEntity, ExecutionDiagnosisStepEntity } from '../modules/execution-diagnosis/execution-diagnosis.entity';

export const dataSourceOptions: DataSourceOptions = {
  type: 'sqlite',
  database: process.env.NODE_ENV === 'test' ? ':memory:' : 'data/geocite.sqlite',
  entities: [BrandEntity, BrandEngineEntity, EngineEntity, ModelEntity, RagAgentEntity, ExecutionDiagnosisRunEntity, ExecutionDiagnosisStepEntity, ExecutionDiagnosisEventEntity, ExecutionDiagnosisPageEntity, ExecutionDiagnosisProbeEntity, ExecutionDiagnosisSampleEntity],
  synchronize: true,
};

export const appDataSource = new DataSource(dataSourceOptions);
