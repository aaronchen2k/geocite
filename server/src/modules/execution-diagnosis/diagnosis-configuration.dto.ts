import { IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { QUESTION_GROUPS } from './brand-question-prompt';

export class DiagnosisQuestionDto {
  @IsString() @MaxLength(500) text!: string;
  @IsOptional() @IsIn(QUESTION_GROUPS) group?: typeof QUESTION_GROUPS[number];
  @IsOptional() @IsIn(QUESTION_GROUPS) primaryCategory?: typeof QUESTION_GROUPS[number];
  @IsOptional() @IsString() @MaxLength(50) secondaryCategory?: string;
  @IsOptional() @IsIn(['cn', 'global', 'both']) market?: 'cn' | 'global' | 'both';
  @IsOptional() @IsBoolean() brandProbe?: boolean;
}

export class SaveDiagnosisQuestionsDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => DiagnosisQuestionDto) questions!: DiagnosisQuestionDto[];
  @IsOptional() @IsString() @MaxLength(2000) prompt?: string;
  @IsOptional() @IsInt() @Min(1) @Max(100) sitemapUrlLimit?: number;
  @IsOptional() @IsInt() @Min(4) @Max(150) samplingQuestionCount?: number;
  @IsOptional() @IsBoolean() playwrightWebReviewEnabled?: boolean;
}

export class GenerateDiagnosisQuestionsDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(2000) prompt?: string;
}

export class SaveDiagnosisPromptDto {
  @IsString() @MaxLength(2000) prompt!: string;
}
