import { IsInt, IsString, MaxLength } from 'class-validator';

export class CreateOptionDto {
  @IsString() @MaxLength(120) name!: string;
  @IsInt() priceDelta = 0;
}
