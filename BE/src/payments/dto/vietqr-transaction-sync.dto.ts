import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';

/** VietQR Host-to-Host `transaction-sync` body. Field casing follows VietQR's contract. */
export class VietQrTransactionSyncDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  transactionid!: string;

  @Transform(({ value }) => String(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  transactiontime!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  referencenumber!: string;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  amount!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1_000)
  content!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  bankaccount!: string;

  @IsIn(['C', 'D'])
  transType!: 'C' | 'D';

  @IsString()
  @IsNotEmpty()
  @MaxLength(13)
  orderId!: string;
}
