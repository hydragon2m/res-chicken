import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateStoreDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  openingTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  closingTime?: string;

  @IsUUID()
  ownerUserId!: string;

  @IsOptional()
  @IsUUID()
  syncFromStoreId?: string;
}

export class UpdateStoreDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  openingTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  closingTime?: string;
}

export class CreateCashRegisterDto {
  @IsUUID()
  storeId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(32)
  code!: string;
}

export class SyncStoreDataDto {
  @IsUUID()
  sourceStoreId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  targetStoreIds!: string[];

  @IsOptional()
  @IsBoolean()
  syncCatalog?: boolean;

  @IsOptional()
  @IsBoolean()
  syncIngredients?: boolean;

  @IsOptional()
  @IsBoolean()
  syncRecipes?: boolean;

  @IsOptional()
  @IsBoolean()
  syncTables?: boolean;
}

export class InterStoreTransferDto {
  @IsUUID()
  fromStoreId!: string;

  @IsUUID()
  toStoreId!: string;

  @IsUUID()
  ingredientId!: string;

  @IsNumber()
  @IsPositive()
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  note?: string;
}
