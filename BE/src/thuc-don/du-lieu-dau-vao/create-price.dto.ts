import { IsInt, IsISO8601, IsOptional, IsUUID, Min } from 'class-validator';
export class CreatePriceDto {
  @IsUUID() variantId!: string;
  @IsInt() @Min(1) amount!: number;
  @IsISO8601() startsAt!: string;
  @IsOptional() @IsISO8601() endsAt?: string;
}
