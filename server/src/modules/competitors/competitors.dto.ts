import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';
export class CreateCompetitorDto { @IsString() name!: string; @IsOptional() @IsArray() @IsString({each: true}) aliases?: string[]; @IsOptional() @IsString() market?: string; }
export class UpdateCompetitorDto { @IsOptional() @IsString() name?: string; @IsOptional() @IsArray() @IsString({each: true}) aliases?: string[]; @IsOptional() @IsString() market?: string; @IsOptional() @IsBoolean() enabled?: boolean; }
