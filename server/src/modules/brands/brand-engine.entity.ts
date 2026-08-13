import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('brand_engines')
@Unique(['brandId', 'engineId'])
@Index(['brandId'])
export class BrandEngineEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'brand_id' })
  brandId!: number;

  @Column({ name: 'engine_id' })
  engineId!: number;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;
}
