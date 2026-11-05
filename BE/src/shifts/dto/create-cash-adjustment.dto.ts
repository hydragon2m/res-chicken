import { IsInt, IsNotEmpty, IsString, MaxLength, NotEquals } from 'class-validator';

export class CreateCashAdjustmentDto {
  @IsInt()
  @NotEquals(0)
  amount!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(240)
  note!: string;
}
