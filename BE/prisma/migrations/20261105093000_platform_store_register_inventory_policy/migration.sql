-- Store-level operating policy and platform administration.
CREATE TYPE "InventoryPolicy" AS ENUM ('OPTIONAL', 'STRICT');

ALTER TABLE "Store"
  ADD COLUMN IF NOT EXISTS "inventoryPolicy" "InventoryPolicy" NOT NULL DEFAULT 'OPTIONAL';

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;

-- A register is the owner of a cash drawer. Existing shifts remain valid with
-- a NULL register until an operator migrates the store to register-based shifts.
CREATE TABLE IF NOT EXISTS "CashRegister" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "storeId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashRegister_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CashRegister_storeId_code_key"
  ON "CashRegister"("storeId", "code");
CREATE INDEX IF NOT EXISTS "CashRegister_storeId_isActive_idx"
  ON "CashRegister"("storeId", "isActive");

ALTER TABLE "Shift" ADD COLUMN IF NOT EXISTS "registerId" UUID;
CREATE INDEX IF NOT EXISTS "Shift_registerId_status_idx" ON "Shift"("registerId", "status");

-- Upgrade existing single-drawer stores without leaving historical shifts
-- orphaned. PostgreSQL 16 provides gen_random_uuid() natively.
INSERT INTO "CashRegister" ("id", "storeId", "name", "code")
SELECT gen_random_uuid(), "id", 'Main register', 'MAIN'
FROM "Store" store_row
WHERE NOT EXISTS (
  SELECT 1
  FROM "CashRegister" register_row
  WHERE register_row."storeId" = store_row."id" AND register_row."code" = 'MAIN'
);

UPDATE "Shift" shift_row
SET "registerId" = register_row."id"
FROM "CashRegister" register_row
WHERE shift_row."registerId" IS NULL
  AND register_row."storeId" = shift_row."storeId"
  AND register_row."code" = 'MAIN';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CashRegister_storeId_fkey') THEN
    ALTER TABLE "CashRegister"
      ADD CONSTRAINT "CashRegister_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Shift_registerId_fkey') THEN
    ALTER TABLE "Shift"
      ADD CONSTRAINT "Shift_registerId_fkey"
      FOREIGN KEY ("registerId") REFERENCES "CashRegister"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DROP INDEX IF EXISTS "Shift_one_open_per_store";
CREATE UNIQUE INDEX IF NOT EXISTS "Shift_one_open_per_register"
  ON "Shift"("registerId") WHERE "status" = 'OPEN' AND "registerId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Shift_one_open_legacy_per_store"
  ON "Shift"("storeId") WHERE "status" = 'OPEN' AND "registerId" IS NULL;
