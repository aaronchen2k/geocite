import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { AuditedEntity } from '../../database/audited.entity';

export type EngineWebReviewConfig = {
  chatUrl: string;
  inputSelector: string;
  answerSelector: string;
  submitSelector?: string | null;
};

@Entity('engines')
export class EngineEntity extends AuditedEntity {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ unique: true }) code!: string;
  @Column() name!: string;
  @Column() vendor!: string;
  @Column({ type: 'text', nullable: true }) homepage!: string | null;
  @Column({ type: 'text', nullable: true }) description!: string | null;
  @Column({ nullable: true }) modelName!: string | null;
  @Column({ type: 'text', nullable: true }) baseUrl!: string | null;
  @Column({ type: 'text', nullable: true }) apiKey!: string | null;
  @Column({ default: false }) webSearchEnabled!: boolean;
  @Column({ name: 'web_review_config_json', type: 'simple-json', nullable: true }) webReviewConfig!: EngineWebReviewConfig | null;
  @Column({ default: false }) disabled!: boolean;
  @Column({ default: 0 }) ordr!: number;
}
