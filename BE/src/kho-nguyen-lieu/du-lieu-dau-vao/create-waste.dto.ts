import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateWasteDto {
  @IsUUID('4')
  storeId!: string;

  @IsUUID('4')
  ingredientId!: string;

  @IsUUID('4')
  locationId!: string;

  @IsOptional()
  @IsUUID('4')
  lotId?: string;

  @IsInt()
  @Min(1)
  @Max(2_000_000_000)
  quantity!: number;

  @IsString()
  @MaxLength(500)
  reason!: string;
}
