import { IsArray, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class SaveDiagnosisQuestionsDto {
  @IsArray() @IsString({ each: true }) @MaxLength(500, { each: true }) questions!: string[];
  @IsOptional() @IsString() @MaxLength(2000) prompt?: string;
}

export class GenerateDiagnosisQuestionsDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(2000) prompt?: string;
}

export class SaveDiagnosisPromptDto {
  @IsString() @MaxLength(2000) prompt!: string;
}
