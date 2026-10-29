import { IsIn, IsOptional, IsNumber, IsString, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class GetMediaDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Transform(({ value }) => parseInt(value, 10))
  page?: number = 1;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['used', 'unused'])
  usage?: 'used' | 'unused';
}
