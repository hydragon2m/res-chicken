CREATE TYPE "ShiftStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "CashMovementKind" AS ENUM ('OPENING_FLOAT', 'CASH_SALE', 'REFUND', 'ADJUSTMENT');
CREATE TYPE "OrderStatus" AS ENUM ('AWAITING_PAYMENT', 'PAID', 'CANCELLED');
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'QR_MANUAL');
CREATE TYPE "PaymentStatus" AS ENUM ('CAPTURED', 'VOIDED');
CREATE TYPE "IdempotencyScope" AS ENUM ('OPEN_SHIFT', 'CLOSE_SHIFT', 'CREATE_ORDER', 'CAPTURE_PAYMENT');

CREATE TABLE "Shift" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "storeId" UUID NOT NULL, "status" "ShiftStatus" NOT NULL DEFAULT 'OPEN',
  "openedById" UUID NOT NULL, "openingCash" INTEGER NOT NULL DEFAULT 0, "closedById" UUID, "declaredCash" INTEGER,
  "expectedCash" INTEGER, "variance" INTEGER, "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "closedAt" TIMESTAMP(3),
  CONSTRAINT "Shift_pkey" PRIMARY KEY ("id"), CONSTRAINT "Shift_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Shift_storeId_status_idx" ON "Shift"("storeId", "status");
CREATE UNIQUE INDEX "Shift_one_open_per_store" ON "Shift"("storeId") WHERE "status" = 'OPEN';

CREATE TABLE "Order" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "storeId" UUID NOT NULL, "createdById" UUID NOT NULL,
  "status" "OrderStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT', "totalAmount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Order_pkey" PRIMARY KEY ("id"), CONSTRAINT "Order_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Order_storeId_createdAt_idx" ON "Order"("storeId", "createdAt");

CREATE TABLE "OrderItem" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "orderId" UUID NOT NULL, "productId" UUID NOT NULL, "variantId" UUID NOT NULL,
  "productName" TEXT NOT NULL, "variantName" TEXT NOT NULL, "unitPrice" INTEGER NOT NULL, "quantity" INTEGER NOT NULL,
  "optionsSnapshot" JSONB NOT NULL, "lineTotal" INTEGER NOT NULL,
  CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id"), CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

CREATE TABLE "Payment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "storeId" UUID NOT NULL, "orderId" UUID NOT NULL, "shiftId" UUID,
  "method" "PaymentMethod" NOT NULL, "status" "PaymentStatus" NOT NULL DEFAULT 'CAPTURED', "amount" INTEGER NOT NULL,
  "capturedById" UUID NOT NULL, "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id"), CONSTRAINT "Payment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Payment_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "Payment_storeId_orderId_idx" ON "Payment"("storeId", "orderId");

CREATE TABLE "CashMovement" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "storeId" UUID NOT NULL, "shiftId" UUID NOT NULL, "paymentId" UUID,
  "kind" "CashMovementKind" NOT NULL, "amount" INTEGER NOT NULL, "note" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id"), CONSTRAINT "CashMovement_paymentId_key" UNIQUE ("paymentId"),
  CONSTRAINT "CashMovement_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CashMovement_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "CashMovement_storeId_shiftId_idx" ON "CashMovement"("storeId", "shiftId");

CREATE TABLE "IdempotencyRecord" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "storeId" UUID NOT NULL, "scope" "IdempotencyScope" NOT NULL, "key" TEXT NOT NULL,
  "orderId" UUID, "paymentId" UUID, "shiftId" UUID, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id"), CONSTRAINT "IdempotencyRecord_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "IdempotencyRecord_storeId_scope_key_key" UNIQUE ("storeId", "scope", "key")
);
