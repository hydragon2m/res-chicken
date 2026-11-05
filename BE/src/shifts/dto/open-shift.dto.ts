import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';
export class OpenShiftDto {
  @IsUUID() storeId!: string;
  // Omitted only for backward-compatible single-register stores; the service
  // resolves the active MAIN register explicitly.
  @IsOptional() @IsUUID() registerId?: string;
  @IsInt() @Min(0) openingCash!: number;
}
