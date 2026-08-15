import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { AuditedEntity } from '../../database/audited.entity';
@Entity('competitors') export class CompetitorEntity extends AuditedEntity { @PrimaryGeneratedColumn() id!: number; @Column({name: 'brand_id'}) brandId!: number; @Column() name!: string; @Column({type: 'simple-json', default: '[]'}) aliases!: string[]; @Column({nullable: true}) market!: string | null; @Column({default: true}) enabled!: boolean; }
