import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { AuditedEntity } from '../../database/audited.entity';

@Entity('engines')
export class EngineEntity extends AuditedEntity {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ unique: true }) code!: string;
  @Column() name!: string;
  @Column() vendor!: string;
  @Column({ type: 'text', nullable: true }) description!: string | null;
  @Column({ nullable: true }) modelName!: string | null;
  @Column({ type: 'text', nullable: true }) baseUrl!: string | null;
  @Column({ type: 'text', nullable: true }) apiKey!: string | null;
  @Column({ default: false }) disabled!: boolean;
  @Column({ default: 0 }) ordr!: number;
}
