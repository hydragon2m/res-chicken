import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
export class RefundPaymentDto {
  @IsString() @IsNotEmpty() @MaxLength(240) note!: string;
}
