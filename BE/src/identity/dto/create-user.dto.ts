import { UserRole } from '@prisma/client';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsEnum,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;

  @IsEnum(UserRole)
  role!: UserRole;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  storeIds!: string[];
}
