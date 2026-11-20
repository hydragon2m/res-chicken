import { ReservationStatus } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreateReservationDto {
  @IsUUID()
  storeId!: string;

  @IsOptional()
  @IsUUID()
  tableId?: string;

  @IsString()
  @IsNotEmpty()
  customerName!: string;

  @IsString()
  @IsNotEmpty()
  customerPhone!: string;

  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @IsInt()
  @Min(1)
  @Max(50)
  guestCount!: number;

  @IsString()
  @IsNotEmpty()
  reservationTime!: string;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(360)
  durationMinutes?: number;

  @IsOptional()
  @IsString()
  specialNotes?: string;
}

export class PublicReservationDto {
  @IsUUID()
  storeId!: string;

  @IsString()
  @IsNotEmpty()
  customerName!: string;

  @IsString()
  @IsNotEmpty()
  customerPhone!: string;

  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @IsInt()
  @Min(1)
  @Max(30)
  guestCount!: number;

  @IsString()
  @IsNotEmpty()
  reservationTime!: string;

  @IsOptional()
  @IsString()
  specialNotes?: string;
}

export class UpdateReservationStatusDto {
  @IsEnum(ReservationStatus)
  status!: ReservationStatus;

  @IsOptional()
  @IsUUID()
  tableId?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
