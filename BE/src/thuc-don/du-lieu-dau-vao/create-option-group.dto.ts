import { IsArray, IsInt, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
class OptionDto {
  @IsString() @MaxLength(120) name!: string;
  @IsInt() priceDelta = 0;
}
export class CreateOptionGroupDto {
  @IsUUID() storeId!: string;
  @IsString() @MaxLength(120) name!: string;
  @IsInt() @Min(0) minSelections = 0;
  @IsInt() @Min(1) maxSelections = 1;
  @IsArray() @ValidateNested({ each: true }) @Type(() => OptionDto) options!: OptionDto[];
}
