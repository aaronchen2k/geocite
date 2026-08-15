import { IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class DiagnosisQuestionDto {
  @IsString() @MaxLength(500) text!: string;
  @IsOptional() @IsString() @MaxLength(30) group?: string;
  @IsOptional() @IsIn(['cn', 'global', 'both']) market?: 'cn' | 'global' | 'both';
  @IsOptional() @IsBoolean() brandProbe?: boolean;
}

export class SaveDiagnosisQuestionsDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => DiagnosisQuestionDto) questions!: DiagnosisQuestionDto[];
  @IsOptional() @IsString() @MaxLength(2000) prompt?: string;
  @IsOptional() @IsInt() @Min(1) @Max(100) sitemapUrlLimit?: number;
}

export class GenerateDiagnosisQuestionsDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(2000) prompt?: string;
}

export class SaveDiagnosisPromptDto {
  @IsString() @MaxLength(2000) prompt!: string;
}
