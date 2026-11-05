-- Callback delivery may be retried. Persisting the bank's immutable transaction
-- ID gives the database the final idempotency guarantee.
ALTER TYPE "PaymentMethod" ADD VALUE 'QR_VIETQR';

ALTER TABLE "Payment" ADD COLUMN "providerTransactionId" TEXT;

CREATE UNIQUE INDEX "Payment_providerTransactionId_key"
ON "Payment"("providerTransactionId");
