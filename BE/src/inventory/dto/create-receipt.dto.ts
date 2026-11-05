import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

class ReceiptLineDto {
  @IsUUID('4')
  ingredientId!: string;

  @IsInt()
  @Min(1)
  @Max(2_000_000_000)
  quantity!: number;

  @IsInt()
  @Min(0)
  @Max(2_000_000_000)
  unitCost!: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  lotCode?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class CreateReceiptDto {
  @IsUUID('4')
  storeId!: string;

  @IsUUID('4')
  locationId!: string;

  @IsOptional()
  @IsUUID('4')
  supplierId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @IsOptional()
  @IsDateString()
  receivedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceiptLineDto)
  lines!: ReceiptLineDto[];
}
