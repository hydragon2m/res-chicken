import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateTransferDto {
  @IsUUID('4')
  storeId!: string;

  @IsUUID('4')
  ingredientId!: string;

  @IsOptional()
  @IsUUID('4')
  lotId?: string;

  @IsUUID('4')
  fromLocationId!: string;

  @IsUUID('4')
  toLocationId!: string;

  @IsInt()
  @Min(1)
  @Max(2_000_000_000)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
