import { FulfillmentStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class TransitionTicketDto {
  @IsEnum(FulfillmentStatus)
  status!: FulfillmentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  note?: string;
}
