import { IsBoolean, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateOptionDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsInt() priceDelta?: number;
  @IsOptional() @IsBoolean() isSoldOut?: boolean;
}
