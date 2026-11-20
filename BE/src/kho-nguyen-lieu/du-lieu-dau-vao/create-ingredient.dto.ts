import { InventoryUnit } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateIngredientDto {
  @IsUUID('4')
  storeId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string;

  @IsString()
  @MaxLength(160)
  name!: string;

  @IsEnum(InventoryUnit)
  unit!: InventoryUnit;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2_000_000_000)
  lowStockQuantity?: number;
}
