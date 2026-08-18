import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateEngineDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() code!: string;
  @IsString() @IsNotEmpty() vendor!: string;
  @IsOptional() @IsString() homepage?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() modelName?: string;
  @IsOptional() @IsString() baseUrl?: string;
  @IsOptional() @IsString() apiKey?: string;
  @IsOptional() @IsBoolean() webSearchEnabled?: boolean;
  @IsOptional() @IsObject() webReviewConfig?: { chatUrl: string; inputSelector: string; answerSelector: string; submitSelector?: string | null; citationSelector?: string | null } | null;
  @IsOptional() @IsBoolean() disabled?: boolean;
}
export class UpdateEngineDto extends CreateEngineDto {}

export class ListEngineDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
  @IsOptional() @IsString() keyword?: string;
  @IsOptional() @IsString() vendor?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() disabled?: boolean;
  @IsOptional() @IsString() sortBy?: string;
  @IsOptional() @IsString() sortOrder?: string;
}
