import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { AuditedEntity } from '../../database/audited.entity';
@Entity('rag_agents') export class RagAgentEntity extends AuditedEntity { @PrimaryGeneratedColumn() id!: number; @Column({ unique: true }) code!: string; @Column() name!: string; @Column({ type: 'text', nullable: true }) description!: string | null; @Column() brandId!: number; @Column() modelId!: number; @Column({ type: 'text', default: '' }) systemPrompt!: string; @Column({ default: false }) disabled!: boolean; }
