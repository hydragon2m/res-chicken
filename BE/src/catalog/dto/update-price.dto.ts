import { IsInt, IsISO8601, IsOptional, Min } from 'class-validator';

export class UpdatePriceDto {
  @IsOptional() @IsInt() @Min(1) amount?: number;
  @IsOptional() @IsISO8601() startsAt?: string;
  @IsOptional() @IsISO8601() endsAt?: string | null;
}
