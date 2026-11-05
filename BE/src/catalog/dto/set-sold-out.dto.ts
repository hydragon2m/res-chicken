import { IsBoolean } from 'class-validator';
export class SetSoldOutDto {
  @IsBoolean() isSoldOut!: boolean;
}
