import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';
export class CreateRagAgentDto { @IsString() @IsNotEmpty() name!: string; @IsString() @IsNotEmpty() code!: string; @IsInt() brandId!: number; @IsInt() modelId!: number; @IsOptional() @IsString() description?: string; @IsOptional() @IsString() systemPrompt?: string; @IsOptional() @IsBoolean() enabled?: boolean; }
export class UpdateRagAgentDto extends CreateRagAgentDto {}
