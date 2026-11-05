CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'DISABLED');
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');
CREATE TYPE "VoucherRedemptionStatus" AS ENUM ('RESERVED', 'REDEEMED', 'RELEASED');

ALTER TABLE "Order" ADD COLUMN "subtotalAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "discountAmount" INTEGER NOT NULL DEFAULT 0;
UPDATE "Order" SET "subtotalAmount" = "totalAmount" WHERE "subtotalAmount" = 0;

CREATE TABLE "Campaign" (
  "id" UUID NOT NULL, "storeId" UUID NOT NULL, "name" TEXT NOT NULL,
  "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT', "discountType" "DiscountType" NOT NULL,
  "discountValue" INTEGER NOT NULL, "minOrderAmount" INTEGER NOT NULL DEFAULT 0,
  "maxDiscountAmount" INTEGER, "redemptionQuota" INTEGER, "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Campaign_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Campaign_storeId_status_startsAt_idx" ON "Campaign"("storeId", "status", "startsAt");
CREATE TABLE "Voucher" (
  "id" UUID NOT NULL, "campaignId" UUID NOT NULL, "code" TEXT NOT NULL,
  "redemptionQuota" INTEGER, "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Voucher_pkey" PRIMARY KEY ("id"), CONSTRAINT "Voucher_code_key" UNIQUE ("code"),
  CONSTRAINT "Voucher_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Voucher_campaignId_isActive_idx" ON "Voucher"("campaignId", "isActive");
CREATE TABLE "VoucherRedemption" (
  "id" UUID NOT NULL, "storeId" UUID NOT NULL, "campaignId" UUID NOT NULL, "voucherId" UUID NOT NULL,
  "orderId" UUID NOT NULL, "status" "VoucherRedemptionStatus" NOT NULL DEFAULT 'RESERVED',
  "discountAmount" INTEGER NOT NULL, "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "redeemedAt" TIMESTAMP(3), "releasedAt" TIMESTAMP(3), "releaseReason" TEXT,
  CONSTRAINT "VoucherRedemption_pkey" PRIMARY KEY ("id"), CONSTRAINT "VoucherRedemption_orderId_key" UNIQUE ("orderId"),
  CONSTRAINT "VoucherRedemption_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "VoucherRedemption_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "Voucher"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "VoucherRedemption_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "VoucherRedemption_campaignId_status_idx" ON "VoucherRedemption"("campaignId", "status");
CREATE INDEX "VoucherRedemption_voucherId_status_idx" ON "VoucherRedemption"("voucherId", "status");
CREATE INDEX "VoucherRedemption_storeId_reservedAt_idx" ON "VoucherRedemption"("storeId", "reservedAt");
