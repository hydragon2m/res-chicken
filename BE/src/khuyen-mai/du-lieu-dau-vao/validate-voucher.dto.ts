import { IsInt, IsNotEmpty, IsString, IsUUID, Min } from 'class-validator';

export class ValidateVoucherDto {
  @IsUUID()
  storeId!: string;

  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsInt()
  @Min(0)
  subtotalAmount!: number;
}
