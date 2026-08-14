import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class SaveDiagnosisQuestionsDto {
  @IsArray() @IsString({ each: true }) @MaxLength(500, { each: true }) questions!: string[];
  @IsOptional() @IsString() @MaxLength(2000) prompt?: string;
  @IsOptional() @IsInt() @Min(1) @Max(100) sitemapUrlLimit?: number;
}

export class GenerateDiagnosisQuestionsDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(2000) prompt?: string;
}

export class SaveDiagnosisPromptDto {
  @IsString() @MaxLength(2000) prompt!: string;
}
