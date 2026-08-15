import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { BrandEntity } from '../brands/brand.entity';

export type ExecutionRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'partial';
export type ExecutionStepStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'unmeasured' | 'cancelled';

@Entity('execution_diagnosis_runs')
export class ExecutionDiagnosisRunEntity {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'brand_id' }) brandId!: number;
  @ManyToOne(() => BrandEntity, { onDelete: 'CASCADE' }) brand!: BrandEntity;
  @Column({ type: 'varchar', default: 'queued' }) status!: ExecutionRunStatus;
  @Column({ name: 'rules_version', default: 'v1' }) rulesVersion!: string;
  @Column({ name: 'summary_json', type: 'simple-json', nullable: true }) summary!: { passed: number; failed: number; manual: number; unmeasured: number } | null;
  @CreateDateColumn({ name: 'created_at', type: 'datetime' }) createdAt!: Date;
  @Column({ name: 'started_at', type: 'datetime', nullable: true }) startedAt!: Date | null;
  @Column({ name: 'finished_at', type: 'datetime', nullable: true }) finishedAt!: Date | null;
  @OneToMany(() => ExecutionDiagnosisStepEntity, (step) => step.run, { cascade: true }) steps!: ExecutionDiagnosisStepEntity[];
  @OneToMany(() => ExecutionDiagnosisEventEntity, (event) => event.run, { cascade: true }) events!: ExecutionDiagnosisEventEntity[];
}

@Entity('execution_diagnosis_steps')
export class ExecutionDiagnosisStepEntity {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'run_id' }) runId!: number;
  @ManyToOne(() => ExecutionDiagnosisRunEntity, (run) => run.steps, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'run_id' }) run!: ExecutionDiagnosisRunEntity;
  @Column() number!: number;
  @Column({ type: 'varchar', default: 'pending' }) status!: ExecutionStepStatus;
  @Column({ name: 'started_at', type: 'datetime', nullable: true }) startedAt!: Date | null;
  @Column({ name: 'finished_at', type: 'datetime', nullable: true }) finishedAt!: Date | null;
  @Column({ name: 'error_code', nullable: true }) errorCode!: string | null;
  @Column({ name: 'result_json', type: 'simple-json', nullable: true }) result!: { conclusion: 'passed' | 'failed' | 'unmeasured'; severity: string; evidence: unknown; recommendation: string } | null;
}

@Entity('execution_diagnosis_events')
export class ExecutionDiagnosisEventEntity {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'run_id' }) runId!: number;
  @ManyToOne(() => ExecutionDiagnosisRunEntity, (run) => run.events, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'run_id' }) run!: ExecutionDiagnosisRunEntity;
  @Column() sequence!: number;
  @Column() type!: 'run' | 'step' | 'log' | 'summary';
  @Column({ name: 'data_json', type: 'simple-json' }) data!: Record<string, unknown>;
  @CreateDateColumn({ name: 'created_at', type: 'datetime' }) createdAt!: Date;
}

@Entity('execution_diagnosis_pages')
export class ExecutionDiagnosisPageEntity {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'run_id' }) runId!: number;
  @ManyToOne(() => ExecutionDiagnosisRunEntity, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'run_id' }) run!: ExecutionDiagnosisRunEntity;
  @Column({ type: 'text' }) url!: string;
  @Column({ name: 'status_code', nullable: true }) statusCode!: number | null;
  @Column({ name: 'content_type', nullable: true }) contentType!: string | null;
  @Column({ type: 'text' }) body!: string;
  @CreateDateColumn({ name: 'fetched_at', type: 'datetime' }) fetchedAt!: Date;
}

@Entity('execution_diagnosis_probes')
export class ExecutionDiagnosisProbeEntity {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'run_id' }) runId!: number;
  @ManyToOne(() => ExecutionDiagnosisRunEntity, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'run_id' }) run!: ExecutionDiagnosisRunEntity;
  @Column({ name: 'user_agent', type: 'text' }) userAgent!: string;
  @Column({ type: 'text' }) url!: string;
  @Column({ name: 'status_code', nullable: true }) statusCode!: number | null;
  @CreateDateColumn({ name: 'probed_at', type: 'datetime' }) probedAt!: Date;
}

@Entity('execution_diagnosis_samples')
export class ExecutionDiagnosisSampleEntity {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'run_id' }) runId!: number;
  @ManyToOne(() => ExecutionDiagnosisRunEntity, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'run_id' }) run!: ExecutionDiagnosisRunEntity;
  @Column({ name: 'engine_id' }) engineId!: number;
  @Column({ name: 'engine_name' }) engineName!: string;
  @Column({ name: 'engine_code' }) engineCode!: string;
  @Column({ name: 'model_name', nullable: true }) modelName!: string | null;
  @Column({ name: 'base_url', type: 'text', nullable: true }) baseUrl!: string | null;
  @Column({ type: 'text', nullable: true }) question!: string | null;
  @Column({ type: 'text' }) prompt!: string;
  @Column({ type: 'text' }) answer!: string;
  @Column({ name: 'status_code', nullable: true }) statusCode!: number | null;
  @Column({ type: 'text', nullable: true }) adapter!: string | null;
  @Column({ name: 'native_web_search', default: false }) nativeWebSearch!: boolean;
  @Column({ type: 'text', nullable: true }) error!: string | null;
  @CreateDateColumn({ name: 'sampled_at', type: 'datetime' }) sampledAt!: Date;
}

@Entity('brand_diagnosis_questions')
export class BrandDiagnosisQuestionEntity {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'brand_id' }) brandId!: number;
  @ManyToOne(() => BrandEntity, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'brand_id' }) brand!: BrandEntity;
  @Column({ type: 'text' }) question!: string;
  @Column({ default: '推荐' }) group!: string;
  @Column({ default: 'cn' }) market!: 'cn' | 'global' | 'both';
  @Column({ name: 'brand_probe', default: false }) brandProbe!: boolean;
  @Column({ default: 0 }) ordr!: number;
  @CreateDateColumn({ name: 'created_at', type: 'datetime' }) createdAt!: Date;
}
