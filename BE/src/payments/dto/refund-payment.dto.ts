import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class RefundPaymentDto {
  @IsString() @IsNotEmpty() @MaxLength(240) note!: string;
  @IsOptional() @IsEnum(PaymentMethod) refundMethod?: PaymentMethod;
}
