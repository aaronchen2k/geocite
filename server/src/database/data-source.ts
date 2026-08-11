import { DataSource, type DataSourceOptions } from 'typeorm';
import { BrandEntity } from '../modules/brands/brand.entity';
import { EngineEntity } from '../modules/engines/engine.entity';
import { ModelEntity } from '../modules/models/model.entity';
import { RagAgentEntity } from '../modules/rag-agents/rag-agent.entity';

export const dataSourceOptions: DataSourceOptions = {
  type: 'sqlite',
  database: process.env.NODE_ENV === 'test' ? ':memory:' : 'data/geocite.sqlite',
  entities: [BrandEntity, EngineEntity, ModelEntity, RagAgentEntity],
  synchronize: true,
};

export const appDataSource = new DataSource(dataSourceOptions);
