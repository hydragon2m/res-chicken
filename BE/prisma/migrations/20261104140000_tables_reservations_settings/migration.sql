-- CreateEnum
CREATE TYPE "TableStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'RESERVED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'SEATED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('POS', 'TABLE_QR', 'TAKEAWAY');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "source" "OrderSource" NOT NULL DEFAULT 'POS',
ADD COLUMN IF NOT EXISTS "tableId" UUID;

-- AlterTable
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "address" TEXT,
ADD COLUMN IF NOT EXISTS "closingTime" TEXT NOT NULL DEFAULT '22:00',
ADD COLUMN IF NOT EXISTS "openingTime" TEXT NOT NULL DEFAULT '08:00',
ADD COLUMN IF NOT EXISTS "phone" TEXT,
ADD COLUMN IF NOT EXISTS "receiptFooter" TEXT,
ADD COLUMN IF NOT EXISTS "receiptHeader" TEXT,
ADD COLUMN IF NOT EXISTS "taxCode" TEXT,
ADD COLUMN IF NOT EXISTS "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0.08;

-- CreateTable
CREATE TABLE IF NOT EXISTS "DiningTable" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "storeId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 4,
    "status" "TableStatus" NOT NULL DEFAULT 'AVAILABLE',
    "qrCodeToken" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiningTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Reservation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "storeId" UUID NOT NULL,
    "tableId" UUID,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerEmail" TEXT,
    "guestCount" INTEGER NOT NULL,
    "reservationTime" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 90,
    "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING',
    "specialNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "DiningTable_qrCodeToken_key" ON "DiningTable"("qrCodeToken");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DiningTable_storeId_status_idx" ON "DiningTable"("storeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "DiningTable_storeId_code_key" ON "DiningTable"("storeId", "code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Reservation_storeId_reservationTime_status_idx" ON "Reservation"("storeId", "reservationTime", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Reservation_tableId_reservationTime_idx" ON "Reservation"("tableId", "reservationTime");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Order_storeId_tableId_idx" ON "Order"("storeId", "tableId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Order_tableId_fkey'
  ) THEN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "DiningTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DiningTable_storeId_fkey'
  ) THEN
    ALTER TABLE "DiningTable" ADD CONSTRAINT "DiningTable_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Reservation_storeId_fkey'
  ) THEN
    ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Reservation_tableId_fkey'
  ) THEN
    ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "DiningTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
