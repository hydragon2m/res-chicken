import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateVariantDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsBoolean() isSoldOut?: boolean;
}
