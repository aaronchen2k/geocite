import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateEngineDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() code!: string;
  @IsString() @IsNotEmpty() vendor!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
}
export class UpdateEngineDto extends CreateEngineDto {}
