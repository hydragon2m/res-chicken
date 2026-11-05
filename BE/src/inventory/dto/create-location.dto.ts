import { InventoryLocationKind } from '@prisma/client';
import { IsEnum, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateLocationDto {
  @IsUUID('4')
  storeId!: string;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsEnum(InventoryLocationKind)
  kind!: InventoryLocationKind;
}
