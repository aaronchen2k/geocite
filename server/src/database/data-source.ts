import { DataSource, type DataSourceOptions } from 'typeorm';
import { BrandEntity } from '../modules/brands/brand.entity';

export const dataSourceOptions: DataSourceOptions = {
  type: 'sqlite',
  database: process.env.NODE_ENV === 'test' ? ':memory:' : 'data/geocite.sqlite',
  entities: [BrandEntity],
  synchronize: true,
};

export const appDataSource = new DataSource(dataSourceOptions);
