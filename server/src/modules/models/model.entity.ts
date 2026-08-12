import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { AuditedEntity } from '../../database/audited.entity';
@Entity('models')
export class ModelEntity extends AuditedEntity { @PrimaryGeneratedColumn() id!: number; @Column() name!: string; @Column({ unique: true }) modelName!: string; @Column() provider!: string; @Column({ nullable: true }) baseUrl!: string | null; @Column({ type: 'text', nullable: true }) apiKey!: string | null; @Column({ default: false }) disabled!: boolean; @Column({ default: false }) isDefault!: boolean; }
