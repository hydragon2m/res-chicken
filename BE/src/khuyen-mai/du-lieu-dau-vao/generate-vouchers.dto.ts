import { IsArray, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class GenerateVouchersDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  quantity?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  customCodes?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  redemptionQuota?: number;
}
