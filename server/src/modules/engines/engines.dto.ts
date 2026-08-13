import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateEngineDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() code!: string;
  @IsString() @IsNotEmpty() vendor!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() modelName?: string;
  @IsOptional() @IsString() baseUrl?: string;
  @IsOptional() @IsString() apiKey?: string;
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
