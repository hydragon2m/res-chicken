import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { FulfillmentStatus } from '@prisma/client';

export class ListTicketsDto {
  @IsUUID()
  storeId!: string;

  @IsOptional()
  @IsEnum(FulfillmentStatus)
  status?: FulfillmentStatus;
}
