ALTER TABLE "Order"
  ADD COLUMN "cancelledById" UUID,
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancellationNote" TEXT;

ALTER TABLE "Payment"
  ADD COLUMN "refundedById" UUID,
  ADD COLUMN "refundedAt" TIMESTAMP(3),
  ADD COLUMN "refundNote" TEXT;
