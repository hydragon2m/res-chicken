import { IsArray, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
class VariantDto {
  @IsString() @MaxLength(120) name!: string;
}
export class CreateProductDto {
  @IsUUID() storeId!: string;
  @IsUUID() categoryId!: string;
  @IsString() @MaxLength(160) name!: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => VariantDto) variants!: VariantDto[];
}
