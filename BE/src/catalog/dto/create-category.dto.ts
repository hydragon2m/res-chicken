import { IsInt, IsString, IsUUID, MaxLength, Min } from 'class-validator';
export class CreateCategoryDto {
  @IsUUID() storeId!: string;
  @IsString() @MaxLength(120) name!: string;
  @IsInt() @Min(0) sortOrder = 0;
}
