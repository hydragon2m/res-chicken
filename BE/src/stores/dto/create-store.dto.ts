import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateStoreDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  // The initial Store Admin must already be a staff account. Creating its
  // password is intentionally kept in Identity, not mixed into Store setup.
  @IsUUID()
  ownerUserId!: string;
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
