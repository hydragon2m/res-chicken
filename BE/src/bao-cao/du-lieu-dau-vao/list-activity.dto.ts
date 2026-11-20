import { IsUUID } from 'class-validator';

export class ListActivityDto {
  @IsUUID()
  storeId!: string;
}
