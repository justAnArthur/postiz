import {
  IsArray,
  IsDefined,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MediaDto } from '@gitroom/nestjs-libraries/dtos/media/media.dto';

export class PayloadTagsSettings {
  @IsString()
  value: string;

  @IsString()
  label: string;
}

export class PayloadDto {
  @ValidateIf((o) => !!o.collection)
  @IsString()
  @Matches(/^[a-z0-9-_]+$/, { message: 'Invalid collection slug' })
  collection?: string;

  @IsString()
  @MinLength(2)
  @IsDefined()
  title: string;

  @ValidateIf((o) => !!o.slug)
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'Invalid slug' })
  slug?: string;

  @IsOptional()
  @IsString()
  excerpt?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => MediaDto)
  main_image?: MediaDto;

  // ids of docs in the blog's `categories` collection
  @IsOptional()
  @IsArray()
  categories?: Array<string | number>;

  @IsOptional()
  @IsArray()
  @Type(() => PayloadTagsSettings)
  @ValidateNested({ each: true })
  tags?: PayloadTagsSettings[];

  @IsOptional()
  @IsString()
  meta_title?: string;

  @IsOptional()
  @IsString()
  meta_description?: string;
}
