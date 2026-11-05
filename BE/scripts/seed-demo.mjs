import {
  InventoryLedgerType,
  InventoryLocationKind,
  InventoryMode,
  InventoryPolicy,
  InventoryUnit,
  PrismaClient,
} from '@prisma/client';

const ownerEmail = process.env.DEMO_OWNER_EMAIL?.trim().toLowerCase();
const storeName = process.env.DEMO_STORE_NAME?.trim() || 'Chick Res Demo';

if (!ownerEmail) {
  throw new Error('Set DEMO_OWNER_EMAIL to an existing Super Admin or Store Admin email.');
}

const prisma = new PrismaClient();

try {
  const owner = await prisma.user.findUnique({ where: { email: ownerEmail } });
  if (!owner?.isActive) throw new Error(`Active owner ${ownerEmail} was not found.`);

  const result = await prisma.$transaction(async (tx) => {
    let store = await tx.store.findFirst({ where: { name: storeName } });
    if (!store) {
      store = await tx.store.create({
        data: { name: storeName, inventoryPolicy: InventoryPolicy.STRICT },
      });
    } else if (store.inventoryPolicy !== InventoryPolicy.STRICT) {
      store = await tx.store.update({
        where: { id: store.id },
        data: { inventoryPolicy: InventoryPolicy.STRICT },
      });
    }

    await tx.storeMember.upsert({
      where: { userId_storeId: { userId: owner.id, storeId: store.id } },
      update: {},
      create: { userId: owner.id, storeId: store.id },
    });
    const register = await tx.cashRegister.upsert({
      where: { storeId_code: { storeId: store.id, code: 'MAIN' } },
      update: { name: 'Quầy chính', isActive: true },
      create: { storeId: store.id, code: 'MAIN', name: 'Quầy chính' },
    });
    const prep = await tx.inventoryLocation.upsert({
      where: { storeId_name: { storeId: store.id, name: 'Khu sơ chế' } },
      update: { kind: InventoryLocationKind.PREP, isActive: true },
      create: { storeId: store.id, name: 'Khu sơ chế', kind: InventoryLocationKind.PREP },
    });
    await tx.inventoryLocation.upsert({
      where: { storeId_name: { storeId: store.id, name: 'Kho khô' } },
      update: { kind: InventoryLocationKind.STORAGE, isActive: true },
      create: { storeId: store.id, name: 'Kho khô', kind: InventoryLocationKind.STORAGE },
    });
    const supplier = await tx.supplier.upsert({
      where: { storeId_name: { storeId: store.id, name: 'Nhà cung cấp demo' } },
      update: { isActive: true },
      create: { storeId: store.id, name: 'Nhà cung cấp demo' },
    });
    const chicken = await tx.ingredient.upsert({
      where: { storeId_sku: { storeId: store.id, sku: 'GA-TUOI' } },
      update: { name: 'Gà tươi', unit: InventoryUnit.GRAM, lowStockQuantity: 3000 },
      create: {
        storeId: store.id,
        sku: 'GA-TUOI',
        name: 'Gà tươi',
        unit: InventoryUnit.GRAM,
        lowStockQuantity: 3000,
      },
    });
    const category = await tx.category.upsert({
      where: { storeId_name: { storeId: store.id, name: 'Gà rán' } },
      update: { isActive: true, sortOrder: 1 },
      create: { storeId: store.id, name: 'Gà rán', sortOrder: 1 },
    });
    let product = await tx.product.findFirst({
      where: { storeId: store.id, name: 'Gà rán truyền thống' },
    });
    if (!product) {
      product = await tx.product.create({
        data: {
          storeId: store.id,
          categoryId: category.id,
          name: 'Gà rán truyền thống',
          inventoryMode: InventoryMode.TRACKED,
          variants: { create: { name: 'Tiêu chuẩn' } },
        },
      });
    } else {
      product = await tx.product.update({
        where: { id: product.id },
        data: { categoryId: category.id, inventoryMode: InventoryMode.TRACKED, isActive: true },
      });
    }
    let variant = await tx.productVariant.findFirst({ where: { productId: product.id } });
    if (!variant) {
      variant = await tx.productVariant.create({
        data: { productId: product.id, name: 'Tiêu chuẩn' },
      });
    }
    const price = await tx.priceSchedule.findFirst({
      where: { variantId: variant.id, endsAt: null },
      orderBy: { startsAt: 'desc' },
    });
    if (!price) {
      await tx.priceSchedule.create({
        data: { variantId: variant.id, amount: 45_000, startsAt: new Date() },
      });
    }
    const recipe = await tx.recipeRevision.findFirst({
      where: { storeId: store.id, productId: product.id, isActive: true },
    });
    if (!recipe) {
      await tx.recipeRevision.create({
        data: {
          storeId: store.id,
          productId: product.id,
          version: 1,
          createdById: owner.id,
          lines: { create: { ingredientId: chicken.id, quantity: 250 } },
        },
      });
    }

    const existingLot = await tx.stockLot.findFirst({
      where: { storeId: store.id, ingredientId: chicken.id, code: 'DEMO-GA-001' },
    });
    if (!existingLot) {
      const receipt = await tx.goodsReceipt.create({
        data: {
          storeId: store.id,
          supplierId: supplier.id,
          locationId: prep.id,
          reference: 'DEMO-INITIAL-STOCK',
          receivedById: owner.id,
        },
      });
      const line = await tx.goodsReceiptLine.create({
        data: {
          receiptId: receipt.id,
          ingredientId: chicken.id,
          quantity: 10_000,
          unitCost: 100,
          lotCode: 'DEMO-GA-001',
        },
      });
      const lot = await tx.stockLot.create({
        data: {
          storeId: store.id,
          ingredientId: chicken.id,
          supplierId: supplier.id,
          receiptLineId: line.id,
          code: 'DEMO-GA-001',
          receivedAt: receipt.receivedAt,
          unitCost: 100,
        },
      });
      await tx.inventoryLedgerEntry.create({
        data: {
          storeId: store.id,
          ingredientId: chicken.id,
          locationId: prep.id,
          lotId: lot.id,
          type: InventoryLedgerType.RECEIPT,
          quantity: 10_000,
          sourceType: 'GOODS_RECEIPT',
          sourceId: receipt.id,
          note: 'Demo opening stock',
          actorId: owner.id,
        },
      });
    }
    return { store, register, product, variant };
  });

  console.log(
    `Demo seed ready: store=${result.store.id}, register=${result.register.id}, variant=${result.variant.id}.`,
  );
} finally {
  await prisma.$disconnect();
}
