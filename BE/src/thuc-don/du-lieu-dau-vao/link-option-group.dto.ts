import { IsUUID } from 'class-validator';
export class LinkOptionGroupDto {
  @IsUUID() optionGroupId!: string;
}
