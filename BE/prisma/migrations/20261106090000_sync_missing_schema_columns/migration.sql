-- Bổ sung đầy đủ các cột và đồng bộ kiểu dữ liệu theo schema.prisma (44 bảng dữ liệu)

-- 1. Bổ sung cột imageUrl cho bảng Product
ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;

-- 2. Bổ sung cột taxRate và taxAmount cho bảng Order
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "taxAmount" INTEGER NOT NULL DEFAULT 0;

-- 3. Đồng bộ độ dài cột orderReference (32) và content (255) trên bảng VietQrPaymentRequest
ALTER TABLE "VietQrPaymentRequest"
  ALTER COLUMN "orderReference" TYPE VARCHAR(32),
  ALTER COLUMN "content" TYPE VARCHAR(255);

-- 4. Chuẩn hóa tên tiếng Việt cho quầy thu ngân mặc định nếu có
UPDATE "CashRegister"
SET "name" = 'Quầy Thu Ngân Chính'
WHERE "name" = 'Main register';
