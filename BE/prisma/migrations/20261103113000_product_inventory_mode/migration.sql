CREATE TYPE "InventoryMode" AS ENUM ('TRACKED', 'NOT_TRACKED');

ALTER TABLE "Product"
  ADD COLUMN "inventoryMode" "InventoryMode" NOT NULL DEFAULT 'NOT_TRACKED';

-- Existing products with an active recipe already participate in stock consumption.
UPDATE "Product" AS product
SET "inventoryMode" = 'TRACKED'
WHERE EXISTS (
  SELECT 1
  FROM "RecipeRevision" AS recipe
  WHERE recipe."productId" = product."id"
    AND recipe."isActive" = true
);
