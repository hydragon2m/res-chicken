import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

class TableOrderLineDto {
  @IsUUID() variantId!: string;
  @IsInt() @Min(1) @Max(100) quantity!: number;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUUID('4', { each: true }) optionIds?: string[];
}

export class TableSelfOrderDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => TableOrderLineDto)
  items!: TableOrderLineDto[];

  @IsOptional()
  @IsString()
  voucherCode?: string;

  @IsOptional()
  @IsString()
  customerNote?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
