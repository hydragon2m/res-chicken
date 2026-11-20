import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import {
  CampaignStatus,
  CashMovementKind,
  DiscountType,
  FulfillmentStatus,
  IdempotencyScope,
  InventoryLedgerType,
  InventoryLocationKind,
  InventoryMode,
  InventoryPolicy,
  InventoryUnit,
  OrderSource,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PrismaClient,
  ReservationStatus,
  ShiftStatus,
  TableStatus,
  UserRole,
  VoucherRedemptionStatus,
} from '@prisma/client';

const prisma = new PrismaClient();
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'ChickResDev!2026';

const permissions = [
  'platform.stores.manage',
  'identity.read',
  'identity.manage',
  'audit.read',
  'catalog.read',
  'catalog.manage',
  'orders.create',
  'orders.read',
  'orders.cancel',
  'shifts.read',
  'shifts.open',
  'shifts.close',
  'shifts.adjust',
  'payments.capture',
  'payments.read',
  'payments.refund',
  'fulfillment.read',
  'fulfillment.manage',
  'inventory.read',
  'inventory.manage',
  'reservations.manage',
  'tables.manage',
  'campaigns.read',
  'campaigns.manage',
  'settings.manage',
  'reports.read',
  'reports.export',
];

const roleMetadata = {
  ADMIN: 'Quản trị viên hệ thống',
  MANAGER: 'Quản lý cửa hàng',
  CASHIER: 'Thu ngân quầy POS',
  KITCHEN: 'Nhân viên bếp KDS',
  INVENTORY_CLERK: 'Thủ kho & Kiểm kê',
};

const roles = Object.keys(roleMetadata);

const grants = {
  ADMIN: permissions.filter((permission) => permission !== 'platform.stores.manage'),
  MANAGER: [
    'catalog.read',
    'catalog.manage',
    'orders.create',
    'orders.read',
    'orders.cancel',
    'shifts.read',
    'shifts.open',
    'shifts.close',
    'shifts.adjust',
    'payments.capture',
    'payments.read',
    'payments.refund',
    'fulfillment.read',
    'fulfillment.manage',
    'inventory.read',
    'inventory.manage',
    'reservations.manage',
    'tables.manage',
    'campaigns.read',
    'campaigns.manage',
    'settings.manage',
    'reports.read',
    'reports.export',
    'audit.read',
  ],
  CASHIER: [
    'catalog.read',
    'orders.create',
    'orders.read',
    'orders.cancel',
    'shifts.read',
    'shifts.open',
    'shifts.close',
    'payments.capture',
    'payments.read',
    'reservations.manage',
    'campaigns.read',
  ],
  KITCHEN: ['catalog.read', 'orders.read', 'fulfillment.read', 'fulfillment.manage'],
  INVENTORY_CLERK: ['inventory.read', 'inventory.manage'],
};

const CATEGORIES_DEF = [
  { name: 'Gà rán', sortOrder: 1 },
  { name: 'Burger & Mì Ý', sortOrder: 2 },
  { name: 'Cơm & Combo', sortOrder: 3 },
  { name: 'Món ăn kèm', sortOrder: 4 },
  { name: 'Đồ uống', sortOrder: 5 },
];

const OPTION_GROUPS_DEF = [
  {
    name: 'Chọn loại sốt gà',
    minSelections: 0,
    maxSelections: 1,
    options: [
      { name: 'Truyền thống (Không sốt)', priceDelta: 0 },
      { name: 'Sốt cay Hàn Quốc Gochujang', priceDelta: 5000 },
      { name: 'Sốt bơ tỏi Hoàng Kim', priceDelta: 5000 },
      { name: 'Sốt phô mai chảy Cheddar', priceDelta: 8000 },
    ],
  },
  {
    name: 'Topping ăn kèm thêm',
    minSelections: 0,
    maxSelections: 3,
    options: [
      { name: 'Phô mai lát Cheddar', priceDelta: 10000 },
      { name: 'Trứng gà ốp la', priceDelta: 10000 },
      { name: 'Sốt chấm phô mai thêm', priceDelta: 8000 },
      { name: 'Bắp cải trộn Coleslaw nhỏ', priceDelta: 12000 },
    ],
  },
  {
    name: 'Tuỳ chọn đá & đường',
    minSelections: 0,
    maxSelections: 1,
    options: [
      { name: 'Đá bình thường (100%)', priceDelta: 0 },
      { name: 'Ít đá (50%)', priceDelta: 0 },
      { name: 'Không đá', priceDelta: 0 },
    ],
  },
];

const INGREDIENTS_DEF = [
  {
    sku: 'GA-TUOI',
    name: 'Thịt gà tươi ướp gia vị',
    unit: InventoryUnit.GRAM,
    lowStockQuantity: 5000,
    unitCost: 95,
  },
  {
    sku: 'CANH-GA',
    name: 'Cánh gà tươi nguyên chiếc',
    unit: InventoryUnit.EACH,
    lowStockQuantity: 40,
    unitCost: 11000,
  },
  {
    sku: 'BOT-CHIEN',
    name: 'Bột chiên gà giòn chuyên dụng',
    unit: InventoryUnit.GRAM,
    lowStockQuantity: 3000,
    unitCost: 45,
  },
  {
    sku: 'DAU-CHIEN',
    name: 'Dầu chiên thực vật cao cấp',
    unit: InventoryUnit.MILLILITER,
    lowStockQuantity: 5000,
    unitCost: 38,
  },
  {
    sku: 'SOT-CAY-HQ',
    name: 'Sốt cay Hàn Quốc Gochujang',
    unit: InventoryUnit.GRAM,
    lowStockQuantity: 1500,
    unitCost: 120,
  },
  {
    sku: 'SOT-BO-TOI',
    name: 'Sốt bơ tỏi thảo mộc',
    unit: InventoryUnit.GRAM,
    lowStockQuantity: 1500,
    unitCost: 115,
  },
  {
    sku: 'VO-BURGER',
    name: 'Vỏ bánh Burger mè nướng',
    unit: InventoryUnit.EACH,
    lowStockQuantity: 30,
    unitCost: 4500,
  },
  {
    sku: 'MI-Y-BO',
    name: 'Sốt bò bằm & Sợi mì Ý',
    unit: InventoryUnit.GRAM,
    lowStockQuantity: 2500,
    unitCost: 85,
  },
  {
    sku: 'KHOAI-TAY',
    name: 'Khoai tây cắt sợi đông lạnh',
    unit: InventoryUnit.GRAM,
    lowStockQuantity: 4000,
    unitCost: 65,
  },
  {
    sku: 'COT-TRA-NUOC',
    name: 'Cốt trà trái cây & Syrup đồ uống',
    unit: InventoryUnit.MILLILITER,
    lowStockQuantity: 3000,
    unitCost: 50,
  },
];

const MENU_ITEMS_DEF = [
  {
    category: 'Gà rán',
    name: 'Gà rán truyền thống',
    imageUrl: 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&w=500&q=80',
    variants: [
      { name: 'Tiêu chuẩn (1 Miếng)', price: 45000 },
      { name: 'Phần 2 Miếng Giòn', price: 85000 },
    ],
    optionGroups: ['Chọn loại sốt gà', 'Topping ăn kèm thêm'],
    recipe: [
      { sku: 'GA-TUOI', quantity: 220 },
      { sku: 'BOT-CHIEN', quantity: 45 },
      { sku: 'DAU-CHIEN', quantity: 30 },
    ],
  },
  {
    category: 'Gà rán',
    name: 'Gà rán sốt cay Hàn Quốc',
    imageUrl: 'https://images.unsplash.com/photo-1527477378408-1bc09c213137?auto=format&fit=crop&w=500&q=80',
    variants: [
      { name: '1 Miếng (Cay vừa)', price: 49000 },
      { name: 'Phần 2 Miếng Sốt Cay', price: 92000 },
    ],
    optionGroups: ['Chọn loại sốt gà', 'Topping ăn kèm thêm'],
    recipe: [
      { sku: 'GA-TUOI', quantity: 220 },
      { sku: 'BOT-CHIEN', quantity: 45 },
      { sku: 'SOT-CAY-HQ', quantity: 35 },
    ],
  },
  {
    category: 'Gà rán',
    name: 'Cánh gà chiên giòn sốt bơ tỏi',
    imageUrl: 'https://images.unsplash.com/photo-1567620832903-9fc6debc209f?auto=format&fit=crop&w=500&q=80',
    variants: [
      { name: 'Phần 3 cánh', price: 65000 },
      { name: 'Phần 6 cánh', price: 122000 },
    ],
    optionGroups: ['Chọn loại sốt gà', 'Topping ăn kèm thêm'],
    recipe: [
      { sku: 'CANH-GA', quantity: 3 },
      { sku: 'BOT-CHIEN', quantity: 40 },
      { sku: 'SOT-BO-TOI', quantity: 35 },
    ],
  },
  {
    category: 'Gà rán',
    name: 'Gà rán cay Mala Tứ Xuyên',
    imageUrl: 'https://images.unsplash.com/photo-1569058242253-92a9c755a0ec?auto=format&fit=crop&w=500&q=80',
    variants: [{ name: '1 Miếng Cay Nồng', price: 52000 }],
    optionGroups: ['Chọn loại sốt gà'],
    recipe: [
      { sku: 'GA-TUOI', quantity: 230 },
      { sku: 'BOT-CHIEN', quantity: 45 },
      { sku: 'SOT-CAY-HQ', quantity: 40 },
    ],
  },
  {
    category: 'Burger & Mì Ý',
    name: 'Burger gà giòn Zinger',
    imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=500&q=80',
    variants: [
      { name: 'Tiêu chuẩn', price: 55000 },
      { name: 'Double Phô Mai', price: 69000 },
    ],
    optionGroups: ['Topping ăn kèm thêm'],
    recipe: [
      { sku: 'VO-BURGER', quantity: 1 },
      { sku: 'GA-TUOI', quantity: 160 },
      { sku: 'BOT-CHIEN', quantity: 30 },
    ],
  },
  {
    category: 'Burger & Mì Ý',
    name: 'Mì Ý sốt bò bằm cà chua',
    imageUrl: 'https://images.unsplash.com/photo-1621996346565-e3d5d6281724?auto=format&fit=crop&w=500&q=80',
    variants: [
      { name: 'Đĩa vừa', price: 49000 },
      { name: 'Đĩa lớn + Gà viên', price: 69000 },
    ],
    optionGroups: ['Topping ăn kèm thêm'],
    recipe: [{ sku: 'MI-Y-BO', quantity: 280 }],
  },
  {
    category: 'Cơm & Combo',
    name: 'Cơm gà giòn sốt tiêu đen',
    imageUrl: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=500&q=80',
    variants: [{ name: 'Phần tiêu chuẩn', price: 59000 }],
    optionGroups: ['Chọn loại sốt gà', 'Topping ăn kèm thêm'],
    recipe: [
      { sku: 'GA-TUOI', quantity: 200 },
      { sku: 'BOT-CHIEN', quantity: 35 },
      { sku: 'SOT-BO-TOI', quantity: 25 },
    ],
  },
  {
    category: 'Cơm & Combo',
    name: 'Combo Gà rán & Khoai tây & Nước',
    imageUrl: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=500&q=80',
    variants: [
      { name: 'Combo 1 người', price: 89000 },
      { name: 'Combo Cặp đôi (2 người)', price: 169000 },
    ],
    optionGroups: ['Chọn loại sốt gà', 'Tuỳ chọn đá & đường'],
    recipe: [
      { sku: 'GA-TUOI', quantity: 220 },
      { sku: 'KHOAI-TAY', quantity: 150 },
      { sku: 'COT-TRA-NUOC', quantity: 250 },
    ],
  },
  {
    category: 'Món ăn kèm',
    name: 'Khoai tây chiên giòn',
    imageUrl: 'https://images.unsplash.com/photo-1576107232684-1279f3908594?auto=format&fit=crop&w=500&q=80',
    variants: [
      { name: 'Size M vừa', price: 22000 },
      { name: 'Size L lớn', price: 29000 },
    ],
    optionGroups: ['Topping ăn kèm thêm'],
    recipe: [
      { sku: 'KHOAI-TAY', quantity: 180 },
      { sku: 'DAU-CHIEN', quantity: 20 },
    ],
  },
  {
    category: 'Món ăn kèm',
    name: 'Gà viên Popcorn lắc phô mai',
    imageUrl: 'https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=500&q=80',
    variants: [{ name: 'Hộp 150g', price: 39000 }],
    optionGroups: ['Topping ăn kèm thêm'],
    recipe: [
      { sku: 'GA-TUOI', quantity: 150 },
      { sku: 'BOT-CHIEN', quantity: 35 },
    ],
  },
  {
    category: 'Đồ uống',
    name: 'Trà đào cam sả',
    imageUrl: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=500&q=80',
    variants: [{ name: 'Ly 500ml', price: 29000 }],
    optionGroups: ['Tuỳ chọn đá & đường'],
    recipe: [{ sku: 'COT-TRA-NUOC', quantity: 300 }],
  },
  {
    category: 'Đồ uống',
    name: 'Coca-Cola tươi có ga',
    imageUrl: 'https://images.unsplash.com/photo-1554866585-cd94860890b7?auto=format&fit=crop&w=500&q=80',
    variants: [{ name: 'Ly 500ml', price: 18000 }],
    optionGroups: ['Tuỳ chọn đá & đường'],
    recipe: [{ sku: 'COT-TRA-NUOC', quantity: 250 }],
  },
  {
    category: 'Đồ uống',
    name: 'Trà chanh sả hạt chia',
    imageUrl: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=500&q=80',
    variants: [{ name: 'Ly 500ml', price: 25000 }],
    optionGroups: ['Tuỳ chọn đá & đường'],
    recipe: [{ sku: 'COT-TRA-NUOC', quantity: 280 }],
  },
];

const DEFAULT_TABLES = [
  { code: 'B-01', name: 'Bàn 1 (Cửa sổ)', capacity: 2 },
  { code: 'B-02', name: 'Bàn 2 (Cửa sổ)', capacity: 4 },
  { code: 'B-03', name: 'Bàn 3 (Sảnh chính)', capacity: 4 },
  { code: 'B-04', name: 'Bàn 4 (Gia đình)', capacity: 6 },
  { code: 'B-05', name: 'Bàn 5 (Sảnh giữa)', capacity: 4 },
  { code: 'B-06', name: 'Bàn 6 (Góc sofa)', capacity: 6 },
  { code: 'VIP-01', name: 'Phòng VIP 1', capacity: 8 },
  { code: 'B10', name: 'Bàn 10 (Sân vườn)', capacity: 4 },
];

async function seedStoreOperationalData({
  store,
  storeTag,
  owner,
  manager,
  cashier,
  kitchen,
  inventoryClerk,
}) {
  // 1. Cash Registers
  const mainRegCode = storeTag === 'Q1' ? 'MAIN' : 'POS-Q7-01';
  const subRegCode = storeTag === 'Q1' ? 'POS-Q1-02' : 'POS-Q7-02';

  const mainRegister = await prisma.cashRegister.upsert({
    where: { storeId_code: { storeId: store.id, code: mainRegCode } },
    update: { name: `Quầy Thu Ngân Chính (${storeTag})`, isActive: true },
    create: {
      storeId: store.id,
      code: mainRegCode,
      name: `Quầy Thu Ngân Chính (${storeTag})`,
      isActive: true,
    },
  });

  await prisma.cashRegister.upsert({
    where: { storeId_code: { storeId: store.id, code: subRegCode } },
    update: { name: `Quầy Thu Ngân Phụ / Kiosk (${storeTag})`, isActive: true },
    create: {
      storeId: store.id,
      code: subRegCode,
      name: `Quầy Thu Ngân Phụ / Kiosk (${storeTag})`,
      isActive: true,
    },
  });

  // 2. Inventory Locations
  const storageLoc = await prisma.inventoryLocation.upsert({
    where: { storeId_name: { storeId: store.id, name: 'Kho bảo quản chính' } },
    update: { kind: InventoryLocationKind.STORAGE, isActive: true },
    create: {
      storeId: store.id,
      name: 'Kho bảo quản chính',
      kind: InventoryLocationKind.STORAGE,
      isActive: true,
    },
  });

  const coldLoc = await prisma.inventoryLocation.upsert({
    where: { storeId_name: { storeId: store.id, name: 'Kho lạnh & Cấp đông' } },
    update: { kind: InventoryLocationKind.STORAGE, isActive: true },
    create: {
      storeId: store.id,
      name: 'Kho lạnh & Cấp đông',
      kind: InventoryLocationKind.STORAGE,
      isActive: true,
    },
  });

  const prepLoc = await prisma.inventoryLocation.upsert({
    where: { storeId_name: { storeId: store.id, name: 'Khu sơ chế bếp' } },
    update: { kind: InventoryLocationKind.PREP, isActive: true },
    create: {
      storeId: store.id,
      name: 'Khu sơ chế bếp',
      kind: InventoryLocationKind.PREP,
      isActive: true,
    },
  });

  // 3. Suppliers
  const suppliersDef = [
    {
      name: 'Công ty CP Thực phẩm Gà Tươi Việt Nam',
      phone: '028 3811 2233',
      note: 'Cung cấp gà tươi đạt chuẩn VietGAP mỗi sáng 06:00',
    },
    {
      name: 'Công ty Gia vị & Bột thực phẩm CJ Foods',
      phone: '028 3844 5566',
      note: 'Cung cấp bột chiên gà, sốt Gochujang Hàn Quốc và sốt bơ tỏi',
    },
    {
      name: 'Nhà phân phối Nước giải khát & Bao bì Sài Gòn',
      phone: '028 3877 8899',
      note: 'Cung cấp khoai tây Bỉ, vỏ bánh Burger, cốt trà và syrup nước ngọt',
    },
  ];
  const suppliers = [];
  for (const s of suppliersDef) {
    const sup = await prisma.supplier.upsert({
      where: { storeId_name: { storeId: store.id, name: s.name } },
      update: { phone: s.phone, note: s.note, isActive: true },
      create: {
        storeId: store.id,
        name: s.name,
        phone: s.phone,
        note: s.note,
        isActive: true,
      },
    });
    suppliers.push(sup);
  }

  // 4. Ingredients
  const ingredientBySku = new Map();
  for (const ingDef of INGREDIENTS_DEF) {
    const ing = await prisma.ingredient.upsert({
      where: { storeId_sku: { storeId: store.id, sku: ingDef.sku } },
      update: {
        name: ingDef.name,
        unit: ingDef.unit,
        lowStockQuantity: ingDef.lowStockQuantity,
        isActive: true,
      },
      create: {
        storeId: store.id,
        sku: ingDef.sku,
        name: ingDef.name,
        unit: ingDef.unit,
        lowStockQuantity: ingDef.lowStockQuantity,
        isActive: true,
      },
    });
    ingredientBySku.set(ingDef.sku, { ...ing, unitCost: ingDef.unitCost });
  }

  // 5. Categories
  const categoryByName = new Map();
  for (const catDef of CATEGORIES_DEF) {
    const cat = await prisma.category.upsert({
      where: { storeId_name: { storeId: store.id, name: catDef.name } },
      update: { sortOrder: catDef.sortOrder, isActive: true },
      create: {
        storeId: store.id,
        name: catDef.name,
        sortOrder: catDef.sortOrder,
        isActive: true,
      },
    });
    categoryByName.set(catDef.name, cat);
  }

  // 6. Option Groups & Options
  const optionGroupByName = new Map();
  for (const ogDef of OPTION_GROUPS_DEF) {
    const og = await prisma.optionGroup.upsert({
      where: { storeId_name: { storeId: store.id, name: ogDef.name } },
      update: {
        minSelections: ogDef.minSelections,
        maxSelections: ogDef.maxSelections,
      },
      create: {
        storeId: store.id,
        name: ogDef.name,
        minSelections: ogDef.minSelections,
        maxSelections: ogDef.maxSelections,
      },
    });
    const createdOptions = [];
    for (const optDef of ogDef.options) {
      const opt = await prisma.option.upsert({
        where: { optionGroupId_name: { optionGroupId: og.id, name: optDef.name } },
        update: { priceDelta: optDef.priceDelta, isSoldOut: false },
        create: {
          optionGroupId: og.id,
          name: optDef.name,
          priceDelta: optDef.priceDelta,
          isSoldOut: false,
        },
      });
      createdOptions.push(opt);
    }
    optionGroupByName.set(ogDef.name, { ...og, options: createdOptions });
  }

  // 7. Products, Variants, PriceSchedules, ProductOptionGroups, and RecipeRevisions (BOM)
  const productMap = new Map();
  for (const itemDef of MENU_ITEMS_DEF) {
    const cat = categoryByName.get(itemDef.category);
    let prod = await prisma.product.findFirst({
      where: { storeId: store.id, name: itemDef.name },
    });
    if (!prod) {
      prod = await prisma.product.create({
        data: {
          storeId: store.id,
          categoryId: cat.id,
          name: itemDef.name,
          imageUrl: itemDef.imageUrl,
          isActive: true,
          isSoldOut: false,
          inventoryMode: InventoryMode.TRACKED,
        },
      });
    } else {
      prod = await prisma.product.update({
        where: { id: prod.id },
        data: {
          categoryId: cat.id,
          imageUrl: itemDef.imageUrl,
          isActive: true,
          isSoldOut: false,
          inventoryMode: InventoryMode.TRACKED,
        },
      });
    }

    const variantsList = [];
    for (const varDef of itemDef.variants) {
      const variant = await prisma.productVariant.upsert({
        where: { productId_name: { productId: prod.id, name: varDef.name } },
        update: { isSoldOut: false },
        create: {
          productId: prod.id,
          name: varDef.name,
          isSoldOut: false,
        },
      });

      const activePrice = await prisma.priceSchedule.findFirst({
        where: { variantId: variant.id, endsAt: null },
        orderBy: { startsAt: 'desc' },
      });
      if (!activePrice) {
        await prisma.priceSchedule.create({
          data: {
            variantId: variant.id,
            amount: varDef.price,
            startsAt: new Date(Date.now() - 30 * 24 * 3600 * 1000),
          },
        });
      }
      variantsList.push({ ...variant, price: activePrice?.amount ?? varDef.price });
    }

    for (const ogName of itemDef.optionGroups) {
      const og = optionGroupByName.get(ogName);
      if (og) {
        await prisma.productOptionGroup.upsert({
          where: {
            productId_optionGroupId: { productId: prod.id, optionGroupId: og.id },
          },
          update: {},
          create: { productId: prod.id, optionGroupId: og.id },
        });
      }
    }

    // Active BOM RecipeRevision + RecipeLines
    let activeRecipe = await prisma.recipeRevision.findFirst({
      where: { storeId: store.id, productId: prod.id, isActive: true },
      include: { lines: true },
    });
    if (!activeRecipe) {
      activeRecipe = await prisma.recipeRevision.create({
        data: {
          storeId: store.id,
          productId: prod.id,
          version: 1,
          isActive: true,
          createdById: manager.id,
          lines: {
            create: itemDef.recipe.map((r) => ({
              ingredientId: ingredientBySku.get(r.sku).id,
              quantity: r.quantity,
            })),
          },
        },
        include: { lines: true },
      });
    }

    productMap.set(itemDef.name, {
      product: prod,
      variants: variantsList,
      recipeDef: itemDef.recipe,
    });
  }

  // 8. Dining Tables
  const tableByCode = new Map();
  for (const tbl of DEFAULT_TABLES) {
    const diningTable = await prisma.diningTable.upsert({
      where: { storeId_code: { storeId: store.id, code: tbl.code } },
      update: { name: tbl.name, capacity: tbl.capacity, isActive: true },
      create: {
        storeId: store.id,
        code: tbl.code,
        name: tbl.name,
        capacity: tbl.capacity,
        status: TableStatus.AVAILABLE,
      },
    });
    tableByCode.set(tbl.code, diningTable);
  }

  // 9. Inventory Receipts, StockLots (FEFO), Transfers, StockCounts, Wastes & Ledger Entries
  const existingLotsCount = await prisma.stockLot.count({ where: { storeId: store.id } });
  const lotBySkuPrep = new Map();
  const lotBySkuStorage = new Map();

  if (existingLotsCount < 5) {
    const now = Date.now();
    // Receipt 1: Main storage batch (FEFO batch A - expiring in 5 days & batch B - expiring in 25 days)
    const storageReceipt = await prisma.goodsReceipt.create({
      data: {
        storeId: store.id,
        supplierId: suppliers[0].id,
        locationId: storageLoc.id,
        reference: `PNK-${storeTag}-STORAGE-01`,
        receivedAt: new Date(now - 5 * 24 * 3600 * 1000),
        receivedById: inventoryClerk.id,
        note: `Nhập kho định kỳ nguyên liệu chính chi nhánh ${storeTag}`,
      },
    });

    // Receipt 2: Kitchen Prep ready-to-cook stock (so POS/KDS strict policy has ample stock)
    const prepReceipt = await prisma.goodsReceipt.create({
      data: {
        storeId: store.id,
        supplierId: suppliers[1].id,
        locationId: prepLoc.id,
        reference: `PNK-${storeTag}-PREP-01`,
        receivedAt: new Date(now - 3 * 24 * 3600 * 1000),
        receivedById: inventoryClerk.id,
        note: `Nhập nguyên liệu trực tiếp vào Khu sơ chế bếp ${storeTag}`,
      },
    });

    for (const ingDef of INGREDIENTS_DEF) {
      const ing = ingredientBySku.get(ingDef.sku);
      const baseQty =
        ingDef.unit === InventoryUnit.EACH
          ? 250
          : ingDef.unit === InventoryUnit.MILLILITER
            ? 35000
            : 40000;

      // Storage Lot
      const storageLotCode = `LOT-${storeTag}-STO-${ingDef.sku}`;
      const storageLine = await prisma.goodsReceiptLine.create({
        data: {
          receiptId: storageReceipt.id,
          ingredientId: ing.id,
          quantity: baseQty,
          unitCost: ingDef.unitCost,
          lotCode: storageLotCode,
          expiresAt: new Date(now + 20 * 24 * 3600 * 1000),
        },
      });
      const storageLot = await prisma.stockLot.create({
        data: {
          storeId: store.id,
          ingredientId: ing.id,
          supplierId: suppliers[0].id,
          receiptLineId: storageLine.id,
          code: storageLotCode,
          receivedAt: storageReceipt.receivedAt,
          expiresAt: storageLine.expiresAt,
          unitCost: ingDef.unitCost,
        },
      });
      await prisma.inventoryLedgerEntry.create({
        data: {
          storeId: store.id,
          ingredientId: ing.id,
          locationId: storageLoc.id,
          lotId: storageLot.id,
          type: InventoryLedgerType.RECEIPT,
          quantity: baseQty,
          sourceType: 'GOODS_RECEIPT',
          sourceId: storageReceipt.id,
          note: `Nhập kho lô ${storageLotCode}`,
          occurredAt: storageReceipt.receivedAt,
          actorId: inventoryClerk.id,
        },
      });
      lotBySkuStorage.set(ingDef.sku, storageLot);

      // Prep Lot (FEFO nearer expiry: 7 days)
      const prepLotCode = `LOT-${storeTag}-PREP-${ingDef.sku}`;
      const prepLine = await prisma.goodsReceiptLine.create({
        data: {
          receiptId: prepReceipt.id,
          ingredientId: ing.id,
          quantity: baseQty,
          unitCost: ingDef.unitCost,
          lotCode: prepLotCode,
          expiresAt: new Date(now + 7 * 24 * 3600 * 1000),
        },
      });
      const prepLot = await prisma.stockLot.create({
        data: {
          storeId: store.id,
          ingredientId: ing.id,
          supplierId: suppliers[1].id,
          receiptLineId: prepLine.id,
          code: prepLotCode,
          receivedAt: prepReceipt.receivedAt,
          expiresAt: prepLine.expiresAt,
          unitCost: ingDef.unitCost,
        },
      });
      await prisma.inventoryLedgerEntry.create({
        data: {
          storeId: store.id,
          ingredientId: ing.id,
          locationId: prepLoc.id,
          lotId: prepLot.id,
          type: InventoryLedgerType.RECEIPT,
          quantity: baseQty,
          sourceType: 'GOODS_RECEIPT',
          sourceId: prepReceipt.id,
          note: `Nhập khu sơ chế lô ${prepLotCode}`,
          occurredAt: prepReceipt.receivedAt,
          actorId: inventoryClerk.id,
        },
      });
      lotBySkuPrep.set(ingDef.sku, prepLot);
    }

    // Internal Transfer: Storage -> Prep for GA-TUOI and BOT-CHIEN
    const gaIng = ingredientBySku.get('GA-TUOI');
    const gaStorageLot = lotBySkuStorage.get('GA-TUOI');
    const transferRecord = await prisma.inventoryTransfer.create({
      data: {
        storeId: store.id,
        ingredientId: gaIng.id,
        lotId: gaStorageLot.id,
        fromLocationId: storageLoc.id,
        toLocationId: prepLoc.id,
        quantity: 5000,
        note: 'Điều chuyển gà tươi từ Kho bảo quản chính sang Khu sơ chế bếp ca sáng',
        transferredById: inventoryClerk.id,
        transferredAt: new Date(now - 2 * 24 * 3600 * 1000),
      },
    });
    await prisma.inventoryLedgerEntry.createMany({
      data: [
        {
          storeId: store.id,
          ingredientId: gaIng.id,
          locationId: storageLoc.id,
          lotId: gaStorageLot.id,
          type: InventoryLedgerType.TRANSFER_OUT,
          quantity: -5000,
          sourceType: 'INVENTORY_TRANSFER',
          sourceId: transferRecord.id,
          note: 'Xuất điều chuyển sang Khu sơ chế bếp',
          occurredAt: transferRecord.transferredAt,
          actorId: inventoryClerk.id,
        },
        {
          storeId: store.id,
          ingredientId: gaIng.id,
          locationId: prepLoc.id,
          lotId: gaStorageLot.id,
          type: InventoryLedgerType.TRANSFER_IN,
          quantity: 5000,
          sourceType: 'INVENTORY_TRANSFER',
          sourceId: transferRecord.id,
          note: 'Nhận điều chuyển từ Kho bảo quản chính',
          occurredAt: transferRecord.transferredAt,
          actorId: inventoryClerk.id,
        },
      ],
    });

    // StockCount (Kiểm kê kho)
    const botIng = ingredientBySku.get('BOT-CHIEN');
    const botPrepLot = lotBySkuPrep.get('BOT-CHIEN');
    const stockCount = await prisma.stockCount.create({
      data: {
        storeId: store.id,
        ingredientId: botIng.id,
        locationId: prepLoc.id,
        lotId: botPrepLot.id,
        expectedQuantity: 40000,
        countedQuantity: 39800,
        varianceQuantity: -200,
        reason: 'Hao hụt tự nhiên bột phủ trong quá trình tẩm ướp cuối ca',
        countedById: inventoryClerk.id,
        countedAt: new Date(now - 36 * 3600 * 1000),
      },
    });
    await prisma.inventoryLedgerEntry.create({
      data: {
        storeId: store.id,
        ingredientId: botIng.id,
        locationId: prepLoc.id,
        lotId: botPrepLot.id,
        type: InventoryLedgerType.COUNT_ADJUSTMENT,
        quantity: -200,
        sourceType: 'STOCK_COUNT',
        sourceId: stockCount.id,
        note: stockCount.reason,
        occurredAt: stockCount.countedAt,
        actorId: inventoryClerk.id,
      },
    });

    // InventoryWaste (Xuất hủy)
    const khoaiIng = ingredientBySku.get('KHOAI-TAY');
    const khoaiPrepLot = lotBySkuPrep.get('KHOAI-TAY');
    const wasteRecord = await prisma.inventoryWaste.create({
      data: {
        storeId: store.id,
        ingredientId: khoaiIng.id,
        locationId: prepLoc.id,
        lotId: khoaiPrepLot.id,
        quantity: 300,
        reason: 'Khoai tây vụn cuối túi không đạt chuẩn kích thước phục vụ',
        wastedById: kitchen.id,
        wastedAt: new Date(now - 24 * 3600 * 1000),
      },
    });
    await prisma.inventoryLedgerEntry.create({
      data: {
        storeId: store.id,
        ingredientId: khoaiIng.id,
        locationId: prepLoc.id,
        lotId: khoaiPrepLot.id,
        type: InventoryLedgerType.WASTE,
        quantity: -300,
        sourceType: 'INVENTORY_WASTE',
        sourceId: wasteRecord.id,
        note: wasteRecord.reason,
        occurredAt: wasteRecord.wastedAt,
        actorId: kitchen.id,
      },
    });

    // Idempotency record for inventory receipt
    await prisma.idempotencyRecord.upsert({
      where: {
        storeId_scope_key: {
          storeId: store.id,
          scope: IdempotencyScope.RECEIVE_INVENTORY,
          key: `seed-receipt-${storeTag}-01`,
        },
      },
      update: {},
      create: {
        storeId: store.id,
        scope: IdempotencyScope.RECEIVE_INVENTORY,
        key: `seed-receipt-${storeTag}-01`,
        receiptId: storageReceipt.id,
      },
    });
  } else {
    // Load existing prep lots for consumption entries
    for (const ingDef of INGREDIENTS_DEF) {
      const ing = ingredientBySku.get(ingDef.sku);
      const lot = await prisma.stockLot.findFirst({
        where: { storeId: store.id, ingredientId: ing.id },
        orderBy: { createdAt: 'asc' },
      });
      if (lot) lotBySkuPrep.set(ingDef.sku, lot);
    }
  }

  // 10. Campaigns & Vouchers
  const campaignsDef = [
    {
      name: `Lễ Hội Gà Giòn ${storeTag} - Giảm 20%`,
      discountType: DiscountType.PERCENTAGE,
      discountValue: 20,
      minOrderAmount: 100000,
      maxDiscountAmount: 50000,
      redemptionQuota: 200,
      voucherCode: storeTag === 'Q1' ? 'GAGION20' : 'Q7GAGION20',
    },
    {
      name: `Bữa Trưa Vui Vẻ ${storeTag} - Giảm Ngay 30.000đ`,
      discountType: DiscountType.FIXED_AMOUNT,
      discountValue: 30000,
      minOrderAmount: 120000,
      maxDiscountAmount: 30000,
      redemptionQuota: 150,
      voucherCode: storeTag === 'Q1' ? 'BUATRUA30K' : 'Q7TRUA30K',
    },
    {
      name: `Combo Gia Đình Cuối Tuần ${storeTag} - Giảm 50.000đ`,
      discountType: DiscountType.FIXED_AMOUNT,
      discountValue: 50000,
      minOrderAmount: 250000,
      maxDiscountAmount: 50000,
      redemptionQuota: 100,
      voucherCode: storeTag === 'Q1' ? 'GIADINH50K' : 'Q7GIADINH50K',
    },
  ];

  const createdVouchers = [];
  for (const campDef of campaignsDef) {
    let campaign = await prisma.campaign.findFirst({
      where: { storeId: store.id, name: campDef.name },
    });
    if (!campaign) {
      campaign = await prisma.campaign.create({
        data: {
          storeId: store.id,
          name: campDef.name,
          status: CampaignStatus.PUBLISHED,
          discountType: campDef.discountType,
          discountValue: campDef.discountValue,
          minOrderAmount: campDef.minOrderAmount,
          maxDiscountAmount: campDef.maxDiscountAmount,
          redemptionQuota: campDef.redemptionQuota,
          startsAt: new Date(Date.now() - 10 * 24 * 3600 * 1000),
          endsAt: new Date(Date.now() + 60 * 24 * 3600 * 1000),
        },
      });
    }
    const voucher = await prisma.voucher.upsert({
      where: { code: campDef.voucherCode },
      update: { isActive: true, redemptionQuota: campDef.redemptionQuota },
      create: {
        campaignId: campaign.id,
        code: campDef.voucherCode,
        redemptionQuota: campDef.redemptionQuota,
        isActive: true,
      },
    });
    createdVouchers.push({ campaign, voucher });
  }

  // 11. Reservations (Đặt bàn)
  const existingReservationsCount = await prisma.reservation.count({
    where: { storeId: store.id },
  });
  if (existingReservationsCount === 0) {
    const now = Date.now();
    await prisma.reservation.createMany({
      data: [
        {
          storeId: store.id,
          tableId: tableByCode.get('VIP-01').id,
          customerName: 'Nguyễn Minh Hoàng',
          customerPhone: '0909123456',
          customerEmail: 'hoang.nguyen@gmail.com',
          guestCount: 6,
          reservationTime: new Date(now + 2 * 3600 * 1000),
          durationMinutes: 90,
          status: ReservationStatus.CONFIRMED,
          specialNotes: 'Tiệc sinh nhật bé, chuẩn bị ghế trẻ em và combo gà giòn',
        },
        {
          storeId: store.id,
          tableId: tableByCode.get('B-04').id,
          customerName: 'Trần Thu Hà',
          customerPhone: '0918234567',
          customerEmail: 'thuha.tran@gmail.com',
          guestCount: 4,
          reservationTime: new Date(now + 4 * 3600 * 1000),
          durationMinutes: 90,
          status: ReservationStatus.PENDING,
          specialNotes: 'Ngồi gần cửa sổ thoáng mát',
        },
        {
          storeId: store.id,
          tableId: tableByCode.get('B-02').id,
          customerName: 'Lê Quốc Bảo',
          customerPhone: '0933456789',
          customerEmail: 'quocbao.le@gmail.com',
          guestCount: 4,
          reservationTime: new Date(now - 30 * 60 * 1000),
          durationMinutes: 90,
          status: ReservationStatus.SEATED,
          specialNotes: 'Khách đã nhận bàn và đang dùng bữa',
        },
        {
          storeId: store.id,
          tableId: tableByCode.get('B-01').id,
          customerName: 'Phạm Thanh Thảo',
          customerPhone: '0977889900',
          customerEmail: 'thanhthao.pham@gmail.com',
          guestCount: 2,
          reservationTime: new Date(now - 24 * 3600 * 1000),
          durationMinutes: 60,
          status: ReservationStatus.COMPLETED,
          specialNotes: 'Khách đặt bàn ăn tối hôm qua',
        },
      ],
    });
    await prisma.diningTable.update({
      where: { id: tableByCode.get('VIP-01').id },
      data: { status: TableStatus.RESERVED },
    });
    await prisma.diningTable.update({
      where: { id: tableByCode.get('B-02').id },
      data: { status: TableStatus.OCCUPIED },
    });
  }

  // 12. Shifts (1 Closed shift from yesterday + 1 Open shift today)
  let closedShift = await prisma.shift.findFirst({
    where: { storeId: store.id, status: ShiftStatus.CLOSED },
  });
  if (!closedShift) {
    const yOpen = new Date(Date.now() - 28 * 3600 * 1000);
    const yClose = new Date(Date.now() - 20 * 3600 * 1000);
    closedShift = await prisma.shift.create({
      data: {
        storeId: store.id,
        registerId: mainRegister.id,
        status: ShiftStatus.CLOSED,
        openedById: cashier.id,
        openingCash: 1000000,
        closedById: manager.id,
        expectedCash: 1580000,
        declaredCash: 1580000,
        variance: 0,
        openedAt: yOpen,
        closedAt: yClose,
      },
    });
    await prisma.cashMovement.create({
      data: {
        storeId: store.id,
        shiftId: closedShift.id,
        kind: CashMovementKind.OPENING_FLOAT,
        amount: 1000000,
        note: 'Tiền mặt đầu ca hôm qua',
        createdAt: yOpen,
      },
    });
  }

  let openShift = await prisma.shift.findFirst({
    where: { storeId: store.id, registerId: mainRegister.id, status: ShiftStatus.OPEN },
  });
  if (!openShift) {
    openShift = await prisma.shift.create({
      data: {
        storeId: store.id,
        registerId: mainRegister.id,
        status: ShiftStatus.OPEN,
        openedById: cashier.id,
        openingCash: 1500000,
        openedAt: new Date(Date.now() - 4 * 3600 * 1000),
      },
    });
    await prisma.cashMovement.create({
      data: {
        storeId: store.id,
        shiftId: openShift.id,
        kind: CashMovementKind.OPENING_FLOAT,
        amount: 1500000,
        note: 'Tiền mặt nạp két đầu ca hiện tại',
        createdAt: openShift.openedAt,
      },
    });
    await prisma.idempotencyRecord.upsert({
      where: {
        storeId_scope_key: {
          storeId: store.id,
          scope: IdempotencyScope.OPEN_SHIFT,
          key: `seed-open-shift-${storeTag}`,
        },
      },
      update: {},
      create: {
        storeId: store.id,
        scope: IdempotencyScope.OPEN_SHIFT,
        key: `seed-open-shift-${storeTag}`,
        shiftId: openShift.id,
      },
    });
  }

  // 13. Orders, OrderItems, Payments, CashMovements, VietQrPaymentRequest, VoucherRedemption, FulfillmentTickets
  const existingOrdersCount = await prisma.order.count({ where: { storeId: store.id } });
  if (existingOrdersCount < 5) {
    const now = Date.now();
    const gaTruyenThong = productMap.get('Gà rán truyền thống');
    const gaHanQuoc = productMap.get('Gà rán sốt cay Hàn Quốc');
    const canhGaBoToi = productMap.get('Cánh gà chiên giòn sốt bơ tỏi');
    const burgerZinger = productMap.get('Burger gà giòn Zinger');
    const miY = productMap.get('Mì Ý sốt bò bằm cà chua');
    const combo1Nguoi = productMap.get('Combo Gà rán & Khoai tây & Nước');
    const khoaiTay = productMap.get('Khoai tây chiên giòn');
    const popcorn = productMap.get('Gà viên Popcorn lắc phô mai');
    const traDao = productMap.get('Trà đào cam sả');
    const coca = productMap.get('Coca-Cola tươi có ga');

    const sampleOrdersSpec = [
      {
        daysAgo: 4,
        source: OrderSource.POS,
        method: PaymentMethod.CASH,
        ticketStatus: FulfillmentStatus.HANDED_OVER,
        tableCode: null,
        items: [
          { entry: gaTruyenThong, variantIdx: 1, qty: 1 },
          { entry: khoaiTay, variantIdx: 1, qty: 1 },
          { entry: coca, variantIdx: 0, qty: 2 },
        ],
      },
      {
        daysAgo: 3,
        source: OrderSource.TABLE_QR,
        method: PaymentMethod.QR_VIETQR,
        ticketStatus: FulfillmentStatus.HANDED_OVER,
        tableCode: 'B-03',
        useVietQrRequest: true,
        items: [
          { entry: gaHanQuoc, variantIdx: 1, qty: 1 },
          { entry: miY, variantIdx: 0, qty: 2 },
          { entry: traDao, variantIdx: 0, qty: 2 },
        ],
      },
      {
        daysAgo: 2,
        source: OrderSource.POS,
        method: PaymentMethod.CASH,
        ticketStatus: FulfillmentStatus.HANDED_OVER,
        tableCode: 'B-04',
        useVoucherIdx: 0,
        items: [
          { entry: canhGaBoToi, variantIdx: 1, qty: 1 },
          { entry: burgerZinger, variantIdx: 0, qty: 2 },
          { entry: popcorn, variantIdx: 0, qty: 1 },
          { entry: traDao, variantIdx: 0, qty: 2 },
        ],
      },
      {
        daysAgo: 1,
        source: OrderSource.TAKEAWAY,
        method: PaymentMethod.QR_MANUAL,
        ticketStatus: FulfillmentStatus.HANDED_OVER,
        tableCode: null,
        items: [
          { entry: combo1Nguoi, variantIdx: 1, qty: 1 },
          { entry: popcorn, variantIdx: 0, qty: 1 },
        ],
      },
      {
        daysAgo: 0,
        hoursAgo: 2.5,
        source: OrderSource.POS,
        method: PaymentMethod.CASH,
        ticketStatus: FulfillmentStatus.READY,
        tableCode: 'B-01',
        items: [
          { entry: gaHanQuoc, variantIdx: 0, qty: 2 },
          { entry: khoaiTay, variantIdx: 1, qty: 1 },
          { entry: traDao, variantIdx: 0, qty: 2 },
        ],
      },
      {
        daysAgo: 0,
        hoursAgo: 0.4,
        source: OrderSource.POS,
        method: PaymentMethod.QR_MANUAL,
        ticketStatus: FulfillmentStatus.PREPARING,
        tableCode: 'B-05',
        items: [
          { entry: canhGaBoToi, variantIdx: 0, qty: 2 },
          { entry: burgerZinger, variantIdx: 1, qty: 1 },
          { entry: coca, variantIdx: 0, qty: 2 },
        ],
      },
      {
        daysAgo: 0,
        hoursAgo: 0.15,
        source: OrderSource.TAKEAWAY,
        method: PaymentMethod.CASH,
        ticketStatus: FulfillmentStatus.QUEUED,
        tableCode: null,
        items: [
          { entry: combo1Nguoi, variantIdx: 0, qty: 2 },
          { entry: gaTruyenThong, variantIdx: 0, qty: 2 },
        ],
      },
    ];

    for (const [idx, spec] of sampleOrdersSpec.entries()) {
      const createdAt = new Date(
        now - (spec.daysAgo * 24 + (spec.hoursAgo ?? 3)) * 3600 * 1000,
      );
      const orderItemsData = spec.items.map((it) => {
        const variant = it.entry.variants[it.variantIdx] ?? it.entry.variants[0];
        return {
          productId: it.entry.product.id,
          variantId: variant.id,
          productName: it.entry.product.name,
          variantName: variant.name,
          unitPrice: variant.price,
          quantity: it.qty,
          optionsSnapshot: [],
          lineTotal: variant.price * it.qty,
          recipeDef: it.entry.recipeDef,
        };
      });

      const subtotalAmount = orderItemsData.reduce((s, i) => s + i.lineTotal, 0);
      let discountAmount = 0;
      let voucherBundle = null;
      if (spec.useVoucherIdx !== undefined && createdVouchers[spec.useVoucherIdx]) {
        voucherBundle = createdVouchers[spec.useVoucherIdx];
        discountAmount = Math.min(
          Math.round((subtotalAmount * voucherBundle.campaign.discountValue) / 100),
          voucherBundle.campaign.maxDiscountAmount ?? 50000,
        );
      }
      const taxable = Math.max(0, subtotalAmount - discountAmount);
      const taxAmount = Math.round(taxable * store.taxRate);
      const totalAmount = taxable + taxAmount;

      const order = await prisma.order.create({
        data: {
          storeId: store.id,
          createdById: cashier.id,
          status: OrderStatus.PAID,
          subtotalAmount,
          discountAmount,
          taxRate: store.taxRate,
          taxAmount,
          totalAmount,
          source: spec.source,
          tableId: spec.tableCode ? tableByCode.get(spec.tableCode)?.id : null,
          createdAt,
          updatedAt: createdAt,
          items: {
            create: orderItemsData.map((oi) => ({
              productId: oi.productId,
              variantId: oi.variantId,
              productName: oi.productName,
              variantName: oi.variantName,
              unitPrice: oi.unitPrice,
              quantity: oi.quantity,
              optionsSnapshot: oi.optionsSnapshot,
              lineTotal: oi.lineTotal,
            })),
          },
        },
        include: { items: true },
      });

      if (voucherBundle) {
        await prisma.voucherRedemption.create({
          data: {
            storeId: store.id,
            campaignId: voucherBundle.campaign.id,
            voucherId: voucherBundle.voucher.id,
            orderId: order.id,
            status: VoucherRedemptionStatus.REDEEMED,
            discountAmount,
            reservedAt: createdAt,
            redeemedAt: createdAt,
          },
        });
      }

      const targetShift = spec.daysAgo === 0 ? openShift : closedShift;
      const payment = await prisma.payment.create({
        data: {
          storeId: store.id,
          orderId: order.id,
          shiftId: targetShift.id,
          method: spec.method,
          status: PaymentStatus.CAPTURED,
          amount: totalAmount,
          capturedById: cashier.id,
          capturedAt: createdAt,
          providerTransactionId:
            spec.method === PaymentMethod.QR_VIETQR
              ? `VQR-${storeTag}-${idx + 1}-${Date.now().toString().slice(-5)}`
              : null,
        },
      });

      if (spec.method === PaymentMethod.CASH) {
        await prisma.cashMovement.create({
          data: {
            storeId: store.id,
            shiftId: targetShift.id,
            paymentId: payment.id,
            kind: CashMovementKind.CASH_SALE,
            amount: totalAmount,
            note: `Thu tiền mặt đơn hàng #${order.id.slice(0, 8).toUpperCase()}`,
            createdAt,
          },
        });
      }

      if (spec.useVietQrRequest) {
        const refCode = `CR${storeTag}${String(idx + 1).padStart(4, '0')}`;
        await prisma.vietQrPaymentRequest.create({
          data: {
            storeId: store.id,
            orderId: order.id,
            orderReference: refCode,
            amount: totalAmount,
            content: `CHICKRES ${refCode}`,
            qrCode: `00020101021238570010A000000727012700069704220113VQR${refCode}53037045406${totalAmount}5802VN6304ABCD`,
            qrLink: `https://img.vietqr.io/image/MB-0318889901-compact2.png?amount=${totalAmount}&addInfo=CHICKRES%20${refCode}`,
            createdAt,
          },
        });
      }

      // Fulfillment Ticket + Items + Events
      const preparingAt =
        spec.ticketStatus !== FulfillmentStatus.QUEUED
          ? new Date(createdAt.getTime() + 2 * 60 * 1000)
          : null;
      const readyAt =
        spec.ticketStatus === FulfillmentStatus.READY ||
        spec.ticketStatus === FulfillmentStatus.HANDED_OVER
          ? new Date(createdAt.getTime() + 8 * 60 * 1000)
          : null;
      const handedOverAt =
        spec.ticketStatus === FulfillmentStatus.HANDED_OVER
          ? new Date(createdAt.getTime() + 10 * 60 * 1000)
          : null;

      const ticket = await prisma.fulfillmentTicket.create({
        data: {
          storeId: store.id,
          orderId: order.id,
          status: spec.ticketStatus,
          priority: idx === 6 ? 1 : 0,
          queuedAt: createdAt,
          preparingAt,
          readyAt,
          handedOverAt,
          preparingById: preparingAt ? kitchen.id : null,
          readyById: readyAt ? kitchen.id : null,
          handedOverById: handedOverAt ? cashier.id : null,
          createdAt,
          items: {
            create: order.items.map((oi, itemIdx) => ({
              orderItemId: oi.id,
              productName: oi.productName,
              variantName: oi.variantName,
              quantity: oi.quantity,
              optionsSnapshot: oi.optionsSnapshot,
              inventoryMode: InventoryMode.TRACKED,
              recipeSnapshot: orderItemsData[itemIdx].recipeDef.map((r) => ({
                ingredientId: ingredientBySku.get(r.sku).id,
                ingredientName: ingredientBySku.get(r.sku).name,
                quantity: r.quantity,
              })),
            })),
          },
        },
      });

      const eventsToCreate = [
        {
          ticketId: ticket.id,
          fromStatus: null,
          toStatus: FulfillmentStatus.QUEUED,
          actorId: cashier.id,
          note: 'Đơn hàng đã thanh toán và chuyển xuống KDS',
          createdAt,
        },
      ];
      if (preparingAt) {
        eventsToCreate.push({
          ticketId: ticket.id,
          fromStatus: FulfillmentStatus.QUEUED,
          toStatus: FulfillmentStatus.PREPARING,
          actorId: kitchen.id,
          note: 'Trạm chiên bắt đầu chế biến',
          createdAt: preparingAt,
        });
      }
      if (readyAt) {
        eventsToCreate.push({
          ticketId: ticket.id,
          fromStatus: FulfillmentStatus.PREPARING,
          toStatus: FulfillmentStatus.READY,
          actorId: kitchen.id,
          note: 'Món đã chín giòn, chuyển sang quầy đóng gói',
          createdAt: readyAt,
        });
      }
      if (handedOverAt) {
        eventsToCreate.push({
          ticketId: ticket.id,
          fromStatus: FulfillmentStatus.READY,
          toStatus: FulfillmentStatus.HANDED_OVER,
          actorId: cashier.id,
          note: 'Đã bàn giao đầy đủ món cho khách',
          createdAt: handedOverAt,
        });
      }
      await prisma.fulfillmentTicketEvent.createMany({ data: eventsToCreate });

      // Record BOM consumption in InventoryLedgerEntry for completed/ready tickets
      if (readyAt) {
        for (const [itemIdx, oi] of order.items.entries()) {
          for (const recLine of orderItemsData[itemIdx].recipeDef) {
            const ing = ingredientBySku.get(recLine.sku);
            const prepLot = lotBySkuPrep.get(recLine.sku);
            await prisma.inventoryLedgerEntry.create({
              data: {
                storeId: store.id,
                ingredientId: ing.id,
                locationId: prepLoc.id,
                lotId: prepLot?.id ?? null,
                type: InventoryLedgerType.CONSUMPTION,
                quantity: -(recLine.quantity * oi.quantity),
                sourceType: 'FULFILLMENT_TICKET',
                sourceId: ticket.id,
                note: `Khấu trừ BOM tự động theo vé bếp (${oi.productName} x${oi.quantity})`,
                occurredAt: readyAt,
                actorId: kitchen.id,
              },
            });
          }
        }
      }

      if (idx === 0) {
        await prisma.idempotencyRecord.upsert({
          where: {
            storeId_scope_key: {
              storeId: store.id,
              scope: IdempotencyScope.CREATE_ORDER,
              key: `seed-order-${storeTag}-01`,
            },
          },
          update: {},
          create: {
            storeId: store.id,
            scope: IdempotencyScope.CREATE_ORDER,
            key: `seed-order-${storeTag}-01`,
            orderId: order.id,
          },
        });
        await prisma.idempotencyRecord.upsert({
          where: {
            storeId_scope_key: {
              storeId: store.id,
              scope: IdempotencyScope.CAPTURE_PAYMENT,
              key: `seed-payment-${storeTag}-01`,
            },
          },
          update: {},
          create: {
            storeId: store.id,
            scope: IdempotencyScope.CAPTURE_PAYMENT,
            key: `seed-payment-${storeTag}-01`,
            paymentId: payment.id,
            orderId: order.id,
          },
        });
      }
    }

    // Active Dine-In Order (AWAITING_PAYMENT on B-02)
    const activeTable = tableByCode.get('B-02');
    const b2Variant1 = gaHanQuoc.variants[0];
    const b2Variant2 = traDao.variants[0];
    const b2Sub = b2Variant1.price * 2 + b2Variant2.price * 2;
    const b2Tax = Math.round(b2Sub * store.taxRate);
    await prisma.order.create({
      data: {
        storeId: store.id,
        createdById: cashier.id,
        status: OrderStatus.AWAITING_PAYMENT,
        subtotalAmount: b2Sub,
        discountAmount: 0,
        taxRate: store.taxRate,
        taxAmount: b2Tax,
        totalAmount: b2Sub + b2Tax,
        source: OrderSource.TABLE_QR,
        tableId: activeTable.id,
        createdAt: new Date(now - 20 * 60 * 1000),
        items: {
          create: [
            {
              productId: gaHanQuoc.product.id,
              variantId: b2Variant1.id,
              productName: gaHanQuoc.product.name,
              variantName: b2Variant1.name,
              unitPrice: b2Variant1.price,
              quantity: 2,
              optionsSnapshot: [{ name: 'Sốt cay Hàn Quốc Gochujang', priceDelta: 5000 }],
              lineTotal: b2Variant1.price * 2,
            },
            {
              productId: traDao.product.id,
              variantId: b2Variant2.id,
              productName: traDao.product.name,
              variantName: b2Variant2.name,
              unitPrice: b2Variant2.price,
              quantity: 2,
              optionsSnapshot: [{ name: 'Ít đá (50%)', priceDelta: 0 }],
              lineTotal: b2Variant2.price * 2,
            },
          ],
        },
      },
    });

    // Refunded Order sample
    const refVar = burgerZinger.variants[0];
    const refSub = refVar.price;
    const refTax = Math.round(refSub * store.taxRate);
    const refTotal = refSub + refTax;
    const refTime = new Date(now - 18 * 3600 * 1000);
    const refundedOrder = await prisma.order.create({
      data: {
        storeId: store.id,
        createdById: cashier.id,
        status: OrderStatus.REFUNDED,
        subtotalAmount: refSub,
        discountAmount: 0,
        taxRate: store.taxRate,
        taxAmount: refTax,
        totalAmount: refTotal,
        source: OrderSource.POS,
        createdAt: refTime,
        items: {
          create: [
            {
              productId: burgerZinger.product.id,
              variantId: refVar.id,
              productName: burgerZinger.product.name,
              variantName: refVar.name,
              unitPrice: refVar.price,
              quantity: 1,
              optionsSnapshot: [],
              lineTotal: refSub,
            },
          ],
        },
      },
    });
    const refundedPayment = await prisma.payment.create({
      data: {
        storeId: store.id,
        orderId: refundedOrder.id,
        shiftId: closedShift.id,
        method: PaymentMethod.CASH,
        status: PaymentStatus.REFUNDED,
        amount: refTotal,
        capturedById: cashier.id,
        capturedAt: refTime,
        refundedById: manager.id,
        refundedAt: new Date(refTime.getTime() + 15 * 60 * 1000),
        refundNote: 'Khách đổi sang combo gia đình, hoàn tiền đơn lẻ',
      },
    });
    await prisma.cashMovement.create({
      data: {
        storeId: store.id,
        shiftId: closedShift.id,
        paymentId: refundedPayment.id,
        kind: CashMovementKind.REFUND,
        amount: -refTotal,
        note: 'Hoàn tiền mặt đơn Burger Zinger theo yêu cầu đổi món',
        createdAt: new Date(refTime.getTime() + 15 * 60 * 1000),
      },
    });

    // Cancelled Order sample
    await prisma.order.create({
      data: {
        storeId: store.id,
        createdById: cashier.id,
        status: OrderStatus.CANCELLED,
        subtotalAmount: 45000,
        discountAmount: 0,
        taxRate: store.taxRate,
        taxAmount: 3600,
        totalAmount: 48600,
        source: OrderSource.POS,
        cancelledById: cashier.id,
        cancelledAt: new Date(now - 12 * 3600 * 1000),
        cancellationNote: 'Khách đặt nhầm món trước khi thanh toán',
        createdAt: new Date(now - 12 * 3600 * 1000),
      },
    });
  }

  // 14. Audit Logs
  const existingAuditsCount = await prisma.auditLog.count({ where: { storeId: store.id } });
  if (existingAuditsCount < 3) {
    await prisma.auditLog.createMany({
      data: [
        {
          storeId: store.id,
          actorId: owner.id,
          action: 'STORE_INITIALIZED',
          targetType: 'STORE',
          targetId: store.id,
          metadata: { storeName: store.name, inventoryPolicy: store.inventoryPolicy },
        },
        {
          storeId: store.id,
          actorId: inventoryClerk.id,
          action: 'GOODS_RECEIPT_POSTED',
          targetType: 'INVENTORY',
          targetId: storageLoc.id,
          metadata: { location: storageLoc.name, ingredientsCount: INGREDIENTS_DEF.length },
        },
        {
          storeId: store.id,
          actorId: cashier.id,
          action: 'SHIFT_OPENED',
          targetType: 'SHIFT',
          targetId: openShift.id,
          metadata: { registerCode: mainRegister.code, openingCash: openShift.openingCash },
        },
        {
          storeId: store.id,
          actorId: manager.id,
          action: 'CATALOG_BOM_VERIFIED',
          targetType: 'CATALOG',
          targetId: store.id,
          metadata: { productsCount: MENU_ITEMS_DEF.length, categoriesCount: CATEGORIES_DEF.length },
        },
      ],
    });
  }
}

try {
  // 1. Seed Permissions, Roles, RolePermissions
  for (const key of permissions) {
    await prisma.permission.upsert({ where: { key }, update: {}, create: { key } });
  }
  for (const key of roles) {
    await prisma.role.upsert({
      where: { key },
      update: { name: roleMetadata[key] },
      create: { key, name: roleMetadata[key] },
    });
  }
  for (const [roleKey, permissionKeys] of Object.entries(grants)) {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    for (const permissionKey of permissionKeys) {
      const permission = await prisma.permission.findUniqueOrThrow({
        where: { key: permissionKey },
      });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }

  // 2. Clean up stale test stores & test users
  const flagship = await prisma.store.findFirst({
    where: {
      OR: [
        { id: 'b3174e0b-f1ce-478b-b1af-6918ecc508eb' },
        { name: { contains: 'Quận 1' } },
      ],
    },
    orderBy: { createdAt: 'asc' },
  });

  const staleStores = await prisma.store.findMany({
    where: {
      OR: [
        { name: { in: ['ChickResDemo', 'Chick Res Branch 2', 'Chick Res Demo'] } },
        ...(flagship ? [{ name: 'Chick Res Main', id: { not: flagship.id } }] : []),
      ],
    },
    select: { id: true },
  });
  if (staleStores.length > 0) {
    const staleIds = staleStores.map((s) => s.id);
    await prisma.diningTable.deleteMany({ where: { storeId: { in: staleIds } } });
    await prisma.storeMember.deleteMany({ where: { storeId: { in: staleIds } } });
    await prisma.inventoryLedgerEntry.deleteMany({ where: { storeId: { in: staleIds } } });
    await prisma.stockLot.deleteMany({ where: { storeId: { in: staleIds } } });
    await prisma.goodsReceipt.deleteMany({ where: { storeId: { in: staleIds } } });
    await prisma.recipeRevision.deleteMany({ where: { storeId: { in: staleIds } } });
    await prisma.ingredient.deleteMany({ where: { storeId: { in: staleIds } } });
    await prisma.supplier.deleteMany({ where: { storeId: { in: staleIds } } });
    await prisma.inventoryLocation.deleteMany({ where: { storeId: { in: staleIds } } });
    await prisma.store.deleteMany({ where: { id: { in: staleIds } } });
  }

  await prisma.user.deleteMany({
    where: {
      OR: [
        { email: { endsWith: '@example.test' } },
        { email: { startsWith: 'kitchen-pos-smoke-' } },
      ],
    },
  });

  // 3. Upsert Both Stores (Quận 1 Flagship & Quận 7 Phú Mỹ Hưng)
  let mainStore = flagship;
  if (!mainStore) {
    mainStore = await prisma.store.findFirst({ orderBy: { createdAt: 'asc' } });
  }
  const q1Data = {
    name: 'Chick Res Quận 1 - Nguyễn Huệ (Flagship)',
    address: '88 Nguyễn Huệ, P. Bến Nghé, Quận 1, TP.HCM',
    phone: '028 3822 8899',
    taxRate: 0.08,
    taxCode: '0318889901',
    receiptHeader: 'CHICK RES FLAGSHIP QUẬN 1 - GÀ RÁN GIÒN NÓNG MỖI NGÀY',
    receiptFooter: 'Cảm ơn Quý khách! Hẹn gặp lại tại Chick Res Nguyễn Huệ!',
    openingTime: '08:00',
    closingTime: '22:30',
    inventoryPolicy: InventoryPolicy.STRICT,
  };
  if (!mainStore) {
    mainStore = await prisma.store.create({ data: q1Data });
  } else {
    mainStore = await prisma.store.update({
      where: { id: mainStore.id },
      data: q1Data,
    });
  }

  let branch2Store = await prisma.store.findFirst({
    where: { id: { not: mainStore.id } },
    orderBy: { createdAt: 'asc' },
  });
  const q7Data = {
    name: 'Chick Res Quận 7 - Phú Mỹ Hưng',
    address: '105 Tôn Dật Tiên, Phú Mỹ Hưng, Quận 7, TP.HCM',
    phone: '028 5411 6688',
    taxRate: 0.08,
    taxCode: '0318889902',
    receiptHeader: 'CHICK RES PHÚ MỸ HƯNG QUẬN 7 - HƯƠNG VỊ GÀ RÁN THƯỢNG HẠNG',
    receiptFooter: 'Cảm ơn Quý khách! Hotline đặt món & giao hàng: 028 5411 6688',
    openingTime: '08:00',
    closingTime: '22:00',
    inventoryPolicy: InventoryPolicy.STRICT,
  };
  if (!branch2Store) {
    branch2Store = await prisma.store.create({ data: q7Data });
  } else {
    branch2Store = await prisma.store.update({
      where: { id: branch2Store.id },
      data: q7Data,
    });
  }

  // 4. Upsert Demo Users & Store Memberships & Demo Sessions
  const demoAccounts = [
    {
      email: 'superadmin@chickres.local',
      role: UserRole.ADMIN,
      isPlatformAdmin: true,
      storeIds: [mainStore.id, branch2Store.id],
    },
    {
      email: 'admin@chickres.local',
      role: UserRole.ADMIN,
      isPlatformAdmin: true,
      storeIds: [mainStore.id, branch2Store.id],
    },
    {
      email: 'manager@chickres.local',
      role: UserRole.MANAGER,
      isPlatformAdmin: false,
      storeIds: [mainStore.id],
    },
    {
      email: 'manager.q7@chickres.local',
      role: UserRole.MANAGER,
      isPlatformAdmin: false,
      storeIds: [branch2Store.id],
    },
    {
      email: 'cashier@chickres.local',
      role: UserRole.CASHIER,
      isPlatformAdmin: false,
      storeIds: [mainStore.id, branch2Store.id],
    },
    {
      email: 'kitchen@chickres.local',
      role: UserRole.KITCHEN,
      isPlatformAdmin: false,
      storeIds: [mainStore.id, branch2Store.id],
    },
    {
      email: 'inventory@chickres.local',
      role: UserRole.INVENTORY_CLERK,
      isPlatformAdmin: false,
      storeIds: [mainStore.id, branch2Store.id],
    },
  ];

  const passwordHash = await argon2.hash(DEMO_PASSWORD);
  const userByEmail = new Map();

  for (const acc of demoAccounts) {
    const roleRecord = await prisma.role.findUniqueOrThrow({ where: { key: acc.role } });
    const user = await prisma.user.upsert({
      where: { email: acc.email },
      create: {
        email: acc.email,
        passwordHash,
        role: acc.role,
        isActive: true,
        isPlatformAdmin: acc.isPlatformAdmin,
      },
      update: {
        passwordHash,
        role: acc.role,
        isActive: true,
        isPlatformAdmin: acc.isPlatformAdmin,
      },
    });
    userByEmail.set(acc.email, user);

    await prisma.userRoleLink.deleteMany({
      where: { userId: user.id, roleId: { not: roleRecord.id } },
    });
    await prisma.userRoleLink.upsert({
      where: { userId_roleId: { userId: user.id, roleId: roleRecord.id } },
      update: {},
      create: { userId: user.id, roleId: roleRecord.id },
    });

    await prisma.storeMember.deleteMany({
      where: { userId: user.id, storeId: { notIn: acc.storeIds } },
    });
    for (const targetStoreId of acc.storeIds) {
      await prisma.storeMember.upsert({
        where: { userId_storeId: { userId: user.id, storeId: targetStoreId } },
        update: {},
        create: { userId: user.id, storeId: targetStoreId },
      });
    }

    // Seed an active Session entry so Session table is populated too
    const selector = `demo-session-${acc.email}`;
    await prisma.session.upsert({
      where: { refreshSelector: selector },
      update: { expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000) },
      create: {
        userId: user.id,
        refreshHash: passwordHash,
        refreshSelector: selector,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      },
    });
  }

  // 5. Seed Complete Operational Data for Both Stores (Q1 & Q7)
  await seedStoreOperationalData({
    store: mainStore,
    storeTag: 'Q1',
    owner: userByEmail.get('superadmin@chickres.local'),
    manager: userByEmail.get('manager@chickres.local'),
    cashier: userByEmail.get('cashier@chickres.local'),
    kitchen: userByEmail.get('kitchen@chickres.local'),
    inventoryClerk: userByEmail.get('inventory@chickres.local'),
  });

  await seedStoreOperationalData({
    store: branch2Store,
    storeTag: 'Q7',
    owner: userByEmail.get('superadmin@chickres.local'),
    manager: userByEmail.get('manager.q7@chickres.local'),
    cashier: userByEmail.get('cashier@chickres.local'),
    kitchen: userByEmail.get('kitchen@chickres.local'),
    inventoryClerk: userByEmail.get('inventory@chickres.local'),
  });

  console.log(
    `[Chick Res Seed] Đã khởi tạo thành công toàn bộ 44 bảng dữ liệu cho 2 chi nhánh (${mainStore.name} & ${branch2Store.name}).`,
  );
} finally {
  await prisma.$disconnect();
}
