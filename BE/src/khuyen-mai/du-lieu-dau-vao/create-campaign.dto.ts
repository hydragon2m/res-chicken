import { DiscountType } from '@prisma/client';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateCampaignDto {
  @IsUUID()
  storeId!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEnum(DiscountType)
  discountType!: DiscountType;

  @IsInt()
  @Min(1)
  discountValue!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  minOrderAmount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxDiscountAmount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  redemptionQuota?: number;

  @IsString()
  @IsNotEmpty()
  startsAt!: string;

  @IsOptional()
  @IsString()
  endsAt?: string;
}
