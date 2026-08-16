import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import type { WorkOrderStatus } from './optimization-verification.entity';

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
