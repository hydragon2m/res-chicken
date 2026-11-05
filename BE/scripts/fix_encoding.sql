-- Fix corrupted font/encoding in catalog, orders, and fulfillment data
UPDATE "Category" SET name = 'Gà rán' WHERE name = 'G? r?n';
UPDATE "Category" SET name = 'Cơm & Combo' WHERE name = 'C?m & Combo';
UPDATE "Category" SET name = 'Đồ uống' WHERE name = '?? u?ng';

UPDATE "Product" SET name = 'Gà rán truyền thống' WHERE name = 'G? r?n truy?n th?ng';
UPDATE "Product" SET name = 'Gà rán cay' WHERE name = 'G? r?n cay';
UPDATE "Product" SET name = 'Cơm gà giòn' WHERE name = 'C?m g? gi?n';
UPDATE "Product" SET name = 'Trà đào' WHERE name = 'Tr? ??o';

UPDATE "ProductVariant" SET name = 'Tiêu chuẩn' WHERE name = 'Ti?u chu?n';

UPDATE "OrderItem" SET "productName" = 'Gà rán truyền thống' WHERE "productName" = 'G? r?n truy?n th?ng';
UPDATE "OrderItem" SET "productName" = 'Gà rán cay' WHERE "productName" = 'G? r?n cay';
UPDATE "OrderItem" SET "productName" = 'Cơm gà giòn' WHERE "productName" = 'C?m g? gi?n';
UPDATE "OrderItem" SET "productName" = 'Trà đào' WHERE "productName" = 'Tr? ??o';
UPDATE "OrderItem" SET "variantName" = 'Tiêu chuẩn' WHERE "variantName" = 'Ti?u chu?n';

UPDATE "FulfillmentTicketItem" SET "productName" = 'Gà rán truyền thống' WHERE "productName" = 'G? r?n truy?n th?ng';
UPDATE "FulfillmentTicketItem" SET "productName" = 'Gà rán cay' WHERE "productName" = 'G? r?n cay';
UPDATE "FulfillmentTicketItem" SET "productName" = 'Cơm gà giòn' WHERE "productName" = 'C?m g? gi?n';
UPDATE "FulfillmentTicketItem" SET "productName" = 'Trà đào' WHERE "productName" = 'Tr? ??o';
UPDATE "FulfillmentTicketItem" SET "variantName" = 'Tiêu chuẩn' WHERE "variantName" = 'Ti?u chu?n';
