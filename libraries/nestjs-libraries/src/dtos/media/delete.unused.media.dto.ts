import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class DeleteUnusedMediaDto {
  @IsDateString()
  before: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim() || undefined)
  search?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  prefix?: string;
}
