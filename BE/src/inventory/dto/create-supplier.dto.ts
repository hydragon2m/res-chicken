import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateSupplierDto {
  @IsUUID('4')
  storeId!: string;

  @IsString()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string;
}
