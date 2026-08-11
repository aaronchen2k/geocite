import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
export class CreateModelDto { @IsString() @IsNotEmpty() name!: string; @IsString() @IsNotEmpty() modelName!: string; @IsString() @IsNotEmpty() provider!: string; @IsOptional() @IsString() baseUrl?: string; @IsOptional() @IsString() apiKey?: string; @IsOptional() @IsBoolean() enabled?: boolean; }
export class UpdateModelDto extends CreateModelDto {}
