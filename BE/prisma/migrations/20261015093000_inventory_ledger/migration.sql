CREATE TYPE "InventoryUnit" AS ENUM ('GRAM', 'MILLILITER', 'EACH');
CREATE TYPE "InventoryLocationKind" AS ENUM ('STORAGE', 'PREP');
CREATE TYPE "InventoryLedgerType" AS ENUM ('RECEIPT', 'TRANSFER_OUT', 'TRANSFER_IN', 'COUNT_ADJUSTMENT', 'WASTE');
ALTER TYPE "IdempotencyScope" ADD VALUE IF NOT EXISTS 'RECEIVE_INVENTORY';
ALTER TABLE "IdempotencyRecord" ADD COLUMN "receiptId" UUID;

CREATE TABLE "Supplier" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "storeId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "note" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Supplier_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Supplier_storeId_name_key" ON "Supplier"("storeId", "name");
CREATE INDEX "Supplier_storeId_isActive_idx" ON "Supplier"("storeId", "isActive");

CREATE TABLE "InventoryLocation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "storeId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "kind" "InventoryLocationKind" NOT NULL DEFAULT 'STORAGE',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InventoryLocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryLocation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InventoryLocation_storeId_name_key" ON "InventoryLocation"("storeId", "name");
CREATE INDEX "InventoryLocation_storeId_isActive_idx" ON "InventoryLocation"("storeId", "isActive");

CREATE TABLE "Ingredient" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "storeId" UUID NOT NULL,
  "sku" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "unit" "InventoryUnit" NOT NULL,
  "lowStockQuantity" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Ingredient_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Ingredient_storeId_sku_key" ON "Ingredient"("storeId", "sku");
CREATE UNIQUE INDEX "Ingredient_storeId_name_key" ON "Ingredient"("storeId", "name");
CREATE INDEX "Ingredient_storeId_isActive_idx" ON "Ingredient"("storeId", "isActive");

CREATE TABLE "GoodsReceipt" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "storeId" UUID NOT NULL,
  "supplierId" UUID,
  "locationId" UUID NOT NULL,
  "reference" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "receivedById" UUID NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoodsReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GoodsReceipt_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GoodsReceipt_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "GoodsReceipt_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "GoodsReceipt_storeId_receivedAt_idx" ON "GoodsReceipt"("storeId", "receivedAt");
CREATE INDEX "GoodsReceipt_locationId_receivedAt_idx" ON "GoodsReceipt"("locationId", "receivedAt");

CREATE TABLE "GoodsReceiptLine" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "receiptId" UUID NOT NULL,
  "ingredientId" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitCost" INTEGER NOT NULL,
  "lotCode" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  CONSTRAINT "GoodsReceiptLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GoodsReceiptLine_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "GoodsReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GoodsReceiptLine_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "GoodsReceiptLine_receiptId_idx" ON "GoodsReceiptLine"("receiptId");
CREATE INDEX "GoodsReceiptLine_ingredientId_idx" ON "GoodsReceiptLine"("ingredientId");

CREATE TABLE "StockLot" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "storeId" UUID NOT NULL,
  "ingredientId" UUID NOT NULL,
  "supplierId" UUID,
  "receiptLineId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "unitCost" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockLot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockLot_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StockLot_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockLot_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "StockLot_receiptLineId_fkey" FOREIGN KEY ("receiptLineId") REFERENCES "GoodsReceiptLine"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "StockLot_receiptLineId_key" ON "StockLot"("receiptLineId");
CREATE UNIQUE INDEX "StockLot_storeId_code_key" ON "StockLot"("storeId", "code");
CREATE INDEX "StockLot_ingredientId_expiresAt_idx" ON "StockLot"("ingredientId", "expiresAt");

CREATE TABLE "InventoryLedgerEntry" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "storeId" UUID NOT NULL,
  "ingredientId" UUID NOT NULL,
  "locationId" UUID NOT NULL,
  "lotId" UUID,
  "type" "InventoryLedgerType" NOT NULL,
  "quantity" INTEGER NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" UUID NOT NULL,
  "note" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actorId" UUID NOT NULL,
  CONSTRAINT "InventoryLedgerEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryLedgerEntry_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "InventoryLedgerEntry_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryLedgerEntry_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryLedgerEntry_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "StockLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "InventoryLedgerEntry_storeId_ingredientId_locationId_occurredAt_idx" ON "InventoryLedgerEntry"("storeId", "ingredientId", "locationId", "occurredAt");
CREATE INDEX "InventoryLedgerEntry_lotId_occurredAt_idx" ON "InventoryLedgerEntry"("lotId", "occurredAt");
CREATE INDEX "InventoryLedgerEntry_sourceType_sourceId_idx" ON "InventoryLedgerEntry"("sourceType", "sourceId");

CREATE TABLE "StockCount" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "storeId" UUID NOT NULL,
  "ingredientId" UUID NOT NULL,
  "locationId" UUID NOT NULL,
  "lotId" UUID,
  "expectedQuantity" INTEGER NOT NULL,
  "countedQuantity" INTEGER NOT NULL,
  "varianceQuantity" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "countedById" UUID NOT NULL,
  "countedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockCount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockCount_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StockCount_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockCount_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockCount_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "StockLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "StockCount_storeId_countedAt_idx" ON "StockCount"("storeId", "countedAt");
CREATE INDEX "StockCount_ingredientId_locationId_idx" ON "StockCount"("ingredientId", "locationId");

CREATE TABLE "InventoryTransfer" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "storeId" UUID NOT NULL,
  "ingredientId" UUID NOT NULL,
  "lotId" UUID,
  "fromLocationId" UUID NOT NULL,
  "toLocationId" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  "note" TEXT,
  "transferredById" UUID NOT NULL,
  "transferredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryTransfer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryTransfer_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "InventoryTransfer_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryTransfer_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "StockLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryTransfer_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryTransfer_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "InventoryTransfer_storeId_transferredAt_idx" ON "InventoryTransfer"("storeId", "transferredAt");
CREATE INDEX "InventoryTransfer_fromLocationId_toLocationId_idx" ON "InventoryTransfer"("fromLocationId", "toLocationId");

CREATE TABLE "InventoryWaste" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "storeId" UUID NOT NULL,
  "ingredientId" UUID NOT NULL,
  "locationId" UUID NOT NULL,
  "lotId" UUID,
  "quantity" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "wastedById" UUID NOT NULL,
  "wastedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryWaste_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryWaste_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "InventoryWaste_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryWaste_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryWaste_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "StockLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "InventoryWaste_storeId_wastedAt_idx" ON "InventoryWaste"("storeId", "wastedAt");
CREATE INDEX "InventoryWaste_ingredientId_locationId_idx" ON "InventoryWaste"("ingredientId", "locationId");

CREATE TABLE "RecipeRevision" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "storeId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecipeRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RecipeRevision_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RecipeRevision_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RecipeRevision_productId_version_key" ON "RecipeRevision"("productId", "version");
CREATE INDEX "RecipeRevision_storeId_productId_isActive_idx" ON "RecipeRevision"("storeId", "productId", "isActive");

CREATE TABLE "RecipeLine" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "recipeId" UUID NOT NULL,
  "ingredientId" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  CONSTRAINT "RecipeLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RecipeLine_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "RecipeRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RecipeLine_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RecipeLine_recipeId_ingredientId_key" ON "RecipeLine"("recipeId", "ingredientId");
