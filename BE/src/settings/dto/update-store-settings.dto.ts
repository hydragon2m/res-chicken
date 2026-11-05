import { InventoryPolicy } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateStoreSettingsDto {
  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  taxRate?: number;

  @IsOptional()
  @IsString()
  taxCode?: string;

  @IsOptional()
  @IsString()
  receiptHeader?: string;

  @IsOptional()
  @IsString()
  receiptFooter?: string;

  @IsOptional()
  @IsString()
  openingTime?: string;

  @IsOptional()
  @IsString()
  closingTime?: string;

  @IsOptional()
  @IsEnum(InventoryPolicy)
  inventoryPolicy?: InventoryPolicy;
}
