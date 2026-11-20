import { IsInt, IsString, IsUUID, Max, MaxLength, Min, IsOptional } from 'class-validator';

export class CreateCountDto {
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
  @Min(0)
  @Max(2_000_000_000)
  countedQuantity!: number;

  @IsString()
  @MaxLength(500)
  reason!: string;
}
