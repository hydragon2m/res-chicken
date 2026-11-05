import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateOptionGroupDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsInt() @Min(0) minSelections?: number;
  @IsOptional() @IsInt() @Min(1) maxSelections?: number;
}
