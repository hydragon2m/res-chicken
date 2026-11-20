import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { OrderSource } from '@prisma/client';

class OrderLineDto {
  @IsUUID() variantId!: string;
  @IsInt() @Min(1) @Max(100) quantity!: number;
  @IsArray() @ArrayMaxSize(20) @IsUUID('4', { each: true }) optionIds!: string[];
}

export class CreateOrderDto {
  @IsUUID() storeId!: string;
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  items!: OrderLineDto[];

  @IsOptional()
  @IsString()
  voucherCode?: string;

  @IsOptional()
  @IsUUID()
  tableId?: string;

  @IsOptional()
  @IsEnum(OrderSource)
  source?: OrderSource;
}
