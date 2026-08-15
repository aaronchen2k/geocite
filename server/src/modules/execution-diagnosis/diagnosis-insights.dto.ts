import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewSampleDto {
  @IsBoolean() brandMention!: boolean;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}
