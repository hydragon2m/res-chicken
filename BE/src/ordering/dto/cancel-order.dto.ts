import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
export class CancelOrderDto {
  @IsString() @IsNotEmpty() @MaxLength(240) note!: string;
}
