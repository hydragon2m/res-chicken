import { IsEnum, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class CapturePaymentDto {
  @IsEnum(PaymentMethod) method!: PaymentMethod;
  @IsInt() @Min(1) amount!: number;
  @IsOptional() @IsUUID() registerId?: string;
}
