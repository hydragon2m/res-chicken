import * as argon2 from 'argon2';
import { PrismaClient, UserRole } from '@prisma/client';

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
const roles = ['ADMIN', 'MANAGER', 'CASHIER', 'KITCHEN', 'INVENTORY_CLERK'];
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

try {
  for (const key of permissions)
    await prisma.permission.upsert({ where: { key }, update: {}, create: { key } });
  for (const key of roles)
    await prisma.role.upsert({ where: { key }, update: { name: key }, create: { key, name: key } });
  for (const [roleKey, permissionKeys] of Object.entries(grants)) {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    for (const permissionKey of permissionKeys) {
      const permission = await prisma.permission.findUniqueOrThrow({ where: { key: permissionKey } });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }

  // Clean up stale demo/test stores (including empty duplicate 'Chick Res Main' if Flagship exists)
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
        { name: { in: ['ChickResDemo', 'Chick Res Branch 2'] } },
        ...(flagship
          ? [{ name: 'Chick Res Main', id: { not: flagship.id } }]
          : []),
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

  let mainStore = flagship;
  if (!mainStore) {
    mainStore = await prisma.store.findFirst({ orderBy: { createdAt: 'asc' } });
  }
  if (!mainStore) {
    mainStore = await prisma.store.create({
      data: {
        name: 'Chick Res Quận 1 - Nguyễn Huệ (Flagship)',
        address: '88 Nguyễn Huệ, P. Bến Nghé, Quận 1, TP.HCM',
        phone: '028 3822 8899',
      },
    });
  } else if (mainStore.name === 'Chick Res Main') {
    mainStore = await prisma.store.update({
      where: { id: mainStore.id },
      data: {
        name: 'Chick Res Quận 1 - Nguyễn Huệ (Flagship)',
        address: '88 Nguyễn Huệ, P. Bến Nghé, Quận 1, TP.HCM',
        phone: '028 3822 8899',
      },
    });
  }

  let branch2Store = await prisma.store.findFirst({
    where: { id: { not: mainStore.id } },
    orderBy: { createdAt: 'asc' },
  });
  if (!branch2Store) {
    branch2Store = await prisma.store.create({
      data: {
        name: 'Chick Res Quận 7 - Phú Mỹ Hưng',
        address: '105 Tôn Dật Tiên, Phú Mỹ Hưng, Quận 7, TP.HCM',
        phone: '028 5411 6688',
      },
    });
  }

  // Ensure default cash registers & locations exist for both stores
  for (const [idx, st] of [mainStore, branch2Store].entries()) {
    const regCount = await prisma.cashRegister.count({ where: { storeId: st.id } });
    if (regCount === 0) {
      await prisma.cashRegister.create({
        data: {
          storeId: st.id,
          code: idx === 0 ? 'MAIN' : 'POS-Q7-01',
          name: idx === 0 ? 'Quầy Thu Ngân Chính (Q1)' : 'Quầy Thu Ngân Chính (Q7)',
        },
      });
    }
    const locCount = await prisma.inventoryLocation.count({ where: { storeId: st.id } });
    if (locCount === 0) {
      await prisma.inventoryLocation.createMany({
        data: [
          { storeId: st.id, name: 'Kho bảo quản chính', kind: 'STORAGE' },
          { storeId: st.id, name: 'Khu sơ chế bếp', kind: 'PREP' },
        ],
      });
    }
  }

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
      storeIds: [mainStore.id],
    },
    {
      email: 'kitchen@chickres.local',
      role: UserRole.KITCHEN,
      isPlatformAdmin: false,
      storeIds: [mainStore.id],
    },
    {
      email: 'inventory@chickres.local',
      role: UserRole.INVENTORY_CLERK,
      isPlatformAdmin: false,
      storeIds: [mainStore.id],
    },
  ];

  const passwordHash = await argon2.hash(DEMO_PASSWORD);
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
    await prisma.userRoleLink.deleteMany({
      where: { userId: user.id, roleId: { not: roleRecord.id } },
    });
    await prisma.userRoleLink.upsert({
      where: { userId_roleId: { userId: user.id, roleId: roleRecord.id } },
      update: {},
      create: { userId: user.id, roleId: roleRecord.id },
    });
    // Strict store membership: remove unintended stores and assign exact storeIds
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
  }

  const defaultTables = [
    { code: 'B-01', name: 'Bàn 1 (Cửa sổ)', capacity: 2 },
    { code: 'B-02', name: 'Bàn 2 (Cửa sổ)', capacity: 4 },
    { code: 'B-03', name: 'Bàn 3 (Sảnh chính)', capacity: 4 },
    { code: 'B-04', name: 'Bàn 4 (Gia đình)', capacity: 6 },
    { code: 'VIP-01', name: 'Phòng VIP 1', capacity: 8 },
    { code: 'B10', name: 'Bàn 10 (Sân vườn)', capacity: 4 },
  ];
  for (const st of [mainStore, branch2Store]) {
    for (const tbl of defaultTables) {
      await prisma.diningTable.upsert({
        where: { storeId_code: { storeId: st.id, code: tbl.code } },
        update: { name: tbl.name, capacity: tbl.capacity, isActive: true },
        create: {
          storeId: st.id,
          code: tbl.code,
          name: tbl.name,
          capacity: tbl.capacity,
        },
      });
    }
  }
} finally {
  await prisma.$disconnect();
}
