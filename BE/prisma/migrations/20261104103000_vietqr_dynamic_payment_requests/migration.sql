-- VietQR dynamic QR uses a provider orderId limited to 13 characters.  Persist
-- that reference independently from the internal UUID order ID so callbacks can
-- be matched and replayed safely.
CREATE TABLE "VietQrPaymentRequest" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "orderReference" VARCHAR(13) NOT NULL,
    "amount" INTEGER NOT NULL,
    "content" VARCHAR(23) NOT NULL,
    "qrCode" TEXT NOT NULL,
    "qrLink" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VietQrPaymentRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VietQrPaymentRequest_orderId_key" ON "VietQrPaymentRequest"("orderId");
CREATE UNIQUE INDEX "VietQrPaymentRequest_orderReference_key" ON "VietQrPaymentRequest"("orderReference");
CREATE INDEX "VietQrPaymentRequest_storeId_createdAt_idx" ON "VietQrPaymentRequest"("storeId", "createdAt");

ALTER TABLE "VietQrPaymentRequest"
  ADD CONSTRAINT "VietQrPaymentRequest_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VietQrPaymentRequest"
  ADD CONSTRAINT "VietQrPaymentRequest_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
