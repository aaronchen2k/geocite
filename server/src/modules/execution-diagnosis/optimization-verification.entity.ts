import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type DiagnosisFindingType = 'brand_absent' | 'competitor_dominated' | 'sampling_failure' | 'site_failure';
export type WorkOrderStatus = 'pending' | 'in_progress' | 'pending_verification' | 'verified' | 'ineffective' | 'cancelled';
export type AttributionConclusion = 'confirmed' | 'possible' | 'inconclusive' | 'no_impact';

@Entity('diagnosis_findings')
export class DiagnosisFindingEntity {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'brand_id' }) brandId!: number;
  @Column({ name: 'source_run_id' }) sourceRunId!: number;
  @Column({ type: 'varchar' }) type!: DiagnosisFindingType;
  @Column({ default: 'P1' }) priority!: string;
  @Column({ name: 'scope_json', type: 'simple-json', nullable: true }) scope!: Record<string, unknown> | null;
  @Column({ name: 'evidence_json', type: 'simple-json' }) evidence!: Record<string, unknown>;
  @Column({ type: 'text' }) recommendation!: string;
  @Column({ default: 'open' }) status!: 'open' | 'resolved' | 'dismissed';
  @CreateDateColumn({ name: 'created_at', type: 'datetime' }) createdAt!: Date;
}

@Entity('optimization_work_orders')
export class OptimizationWorkOrderEntity {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'brand_id' }) brandId!: number;
  @Column({ name: 'source_run_id', nullable: true }) sourceRunId!: number | null;
  @Column({ name: 'source_finding_id', nullable: true }) sourceFindingId!: number | null;
  @Column({ type: 'text', nullable: true }) title!: string | null;
  @Column({ type: 'text', nullable: true }) description!: string | null;
  @Column({ name: 'acceptance_criteria', type: 'text', nullable: true }) acceptanceCriteria!: string | null;
  @Column({ default: 'pending' }) status!: WorkOrderStatus;
  @Column({ name: 'owner_name', nullable: true }) ownerName!: string | null;
  @Column({ name: 'due_at', type: 'datetime', nullable: true }) dueAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'datetime' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' }) updatedAt!: Date;
}

@Entity('optimization_work_order_transitions')
@Index(['brandId', 'workOrderId', 'transitionedAt'])
export class OptimizationWorkOrderTransitionEntity {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'brand_id' }) brandId!: number;
  @Column({ name: 'work_order_id' }) workOrderId!: number;
  @Column({ name: 'previous_status' }) previousStatus!: WorkOrderStatus;
  @Column({ name: 'new_status' }) newStatus!: WorkOrderStatus;
  @Column({ name: 'comparison_id', nullable: true }) comparisonId!: number | null;
  @Column({ name: 'acceptance_note', type: 'text', nullable: true }) acceptanceNote!: string | null;
  @Column({ name: 'cancellation_reason', type: 'text', nullable: true }) cancellationReason!: string | null;
  @Column({ default: 'system' }) actor!: string;
  @CreateDateColumn({ name: 'transitioned_at', type: 'datetime' }) transitionedAt!: Date;
}

@Entity('optimization_actions')
@Index(['brandId', 'workOrderId'])
export class OptimizationActionEntity {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'brand_id' }) brandId!: number;
  @Column({ name: 'work_order_id' }) workOrderId!: number;
  @Column({ type: 'text' }) description!: string;
  @Column({ name: 'scope_json', type: 'simple-json', nullable: true }) scope!: Record<string, unknown> | null;
  @Column({ name: 'evidence_json', type: 'simple-json', nullable: true }) evidence!: Record<string, unknown> | null;
  @Column({ name: 'completed_at', type: 'datetime' }) completedAt!: Date;
  @CreateDateColumn({ name: 'created_at', type: 'datetime' }) createdAt!: Date;
}

@Entity('diagnosis_comparisons')
export class DiagnosisComparisonEntity {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'brand_id' }) brandId!: number;
  @Column({ name: 'baseline_run_id' }) baselineRunId!: number;
  @Column({ name: 'retest_run_id' }) retestRunId!: number;
  @Column({ default: 'pending' }) comparability!: 'pending' | 'comparable' | 'partially_comparable' | 'not_comparable';
  @Column({ name: 'metrics_json', type: 'simple-json', nullable: true }) metrics!: Record<string, unknown> | null;
  @Column({ name: 'reason', type: 'text', nullable: true }) reason!: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'datetime' }) createdAt!: Date;
}

@Entity('attribution_records')
@Index(['brandId', 'workOrderId', 'comparisonId'])
export class AttributionRecordEntity {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'brand_id' }) brandId!: number;
  @Column({ name: 'work_order_id' }) workOrderId!: number;
  @Column({ name: 'comparison_id' }) comparisonId!: number;
  @Column({ type: 'varchar' }) conclusion!: AttributionConclusion;
  @Column({ type: 'text', nullable: true }) rationale!: string | null;
  @Column({ name: 'confirmed_by', nullable: true }) confirmedBy!: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'datetime' }) createdAt!: Date;
}

@Entity('periodic_retest_plans')
export class PeriodicRetestPlanEntity {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'brand_id' }) brandId!: number;
  @Column({ name: 'baseline_run_id', nullable: true }) baselineRunId!: number | null;
  @Column() frequency!: string;
  @Column({ name: 'scope_json', type: 'simple-json', nullable: true }) scope!: Record<string, unknown> | null;
  @Column({ default: true }) enabled!: boolean;
  @Column({ name: 'last_run_id', nullable: true }) lastRunId!: number | null;
  @CreateDateColumn({ name: 'created_at', type: 'datetime' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' }) updatedAt!: Date;
}

@Entity('comparison_experiments')
export class ComparisonExperimentEntity {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'brand_id' }) brandId!: number;
  @Column({ type: 'text' }) name!: string;
  @Column({ name: 'control_scope_json', type: 'simple-json' }) controlScope!: Record<string, unknown>;
  @Column({ name: 'treatment_scope_json', type: 'simple-json' }) treatmentScope!: Record<string, unknown>;
  @Column({ name: 'success_metrics_json', type: 'simple-json' }) successMetrics!: Record<string, unknown>;
  @Column({ name: 'control_run_id', nullable: true }) controlRunId!: number | null;
  @Column({ name: 'treatment_run_id', nullable: true }) treatmentRunId!: number | null;
  @Column({ default: 'draft' }) status!: 'draft' | 'running' | 'completed' | 'cancelled';
  @CreateDateColumn({ name: 'created_at', type: 'datetime' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' }) updatedAt!: Date;
}
