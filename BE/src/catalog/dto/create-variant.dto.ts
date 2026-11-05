import { IsString, MaxLength } from 'class-validator';

export class CreateVariantDto {
  @IsString() @MaxLength(120) name!: string;
}
