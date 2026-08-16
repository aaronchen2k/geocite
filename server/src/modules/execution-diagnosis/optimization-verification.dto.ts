import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import type { AttributionConclusion, WorkOrderStatus } from './optimization-verification.entity';

export class CreateOptimizationWorkOrderDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) sourceRunId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) sourceFindingId?: number;
  @IsOptional() @IsString() @MaxLength(500) title?: string;
  @IsOptional() @IsString() @MaxLength(10_000) description?: string;
  @IsOptional() @IsString() @MaxLength(5_000) acceptanceCriteria?: string;
  @IsOptional() @IsString() @MaxLength(200) ownerName?: string;
  @IsOptional() @IsDateString() dueAt?: string;
}

export class CreateOptimizationActionDto {
  @IsString() @IsNotEmpty() @MaxLength(10_000) description!: string;
  @IsOptional() @IsObject() scope?: Record<string, unknown>;
  @IsOptional() @IsObject() evidence?: Record<string, unknown>;
  @IsOptional() @IsDateString() completedAt?: string;
}

export class TransitionOptimizationWorkOrderDto {
  @IsIn(['pending', 'in_progress', 'pending_verification', 'verified', 'ineffective', 'cancelled']) status!: WorkOrderStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) comparisonId?: number;
  @IsOptional() @IsString() @MaxLength(5_000) acceptanceNote?: string;
  @IsOptional() @IsString() @MaxLength(2_000) reason?: string;
  @IsOptional() @IsString() @MaxLength(200) actor?: string;
}

export class CompareDiagnosisRunsDto {
  @Type(() => Number) @IsInt() @Min(1) baselineRunId!: number;
  @Type(() => Number) @IsInt() @Min(1) retestRunId!: number;
}

export class CreateAttributionDto {
  @Type(() => Number) @IsInt() @Min(1) workOrderId!: number;
  @Type(() => Number) @IsInt() @Min(1) comparisonId!: number;
  @IsIn(['confirmed', 'possible', 'inconclusive', 'no_impact']) conclusion!: AttributionConclusion;
  @IsOptional() @IsString() @MaxLength(5_000) rationale?: string;
  @IsOptional() @IsString() @MaxLength(200) confirmedBy?: string;
}

export class CreatePeriodicRetestPlanDto {
  @IsIn(['weekly', 'monthly', 'quarterly']) frequency!: 'weekly' | 'monthly' | 'quarterly';
  @IsObject() scope!: Record<string, unknown>;
  @IsObject() notification!: Record<string, unknown>;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) baselineRunId?: number;
  @IsOptional() @IsBoolean() enabled?: boolean;
}

export class UpdatePeriodicRetestPlanDto {
  @IsOptional() @IsIn(['weekly', 'monthly', 'quarterly']) frequency?: 'weekly' | 'monthly' | 'quarterly';
  @IsOptional() @IsObject() scope?: Record<string, unknown>;
  @IsOptional() @IsObject() notification?: Record<string, unknown>;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) baselineRunId?: number;
  @IsOptional() @IsBoolean() enabled?: boolean;
}

export class CreateComparisonExperimentDto {
  @IsString() @IsNotEmpty() @MaxLength(500) name!: string;
  @IsObject() controlScope!: Record<string, unknown>;
  @IsObject() treatmentScope!: Record<string, unknown>;
  @IsObject() successMetrics!: Record<string, unknown>;
}

export class EvaluateComparisonExperimentDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) controlRunId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) treatmentRunId?: number;
}
