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
  for (const key of permissions) await prisma.permission.upsert({ where: { key }, update: {}, create: { key } });
  for (const key of roles) await prisma.role.upsert({ where: { key }, update: { name: key }, create: { key, name: key } });
  for (const [roleKey, permissionKeys] of Object.entries(grants)) {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    for (const permissionKey of permissionKeys) {
      const permission = await prisma.permission.findUniqueOrThrow({ where: { key: permissionKey } });
      await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } }, update: {}, create: { roleId: role.id, permissionId: permission.id } });
    }
  }
  const users = await prisma.user.findMany({ select: { id: true, role: true } });
  for (const user of users) {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: user.role } });
    await prisma.userRoleLink.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, update: {}, create: { userId: user.id, roleId: role.id } });
  }

  const staleStores = await prisma.store.findMany({
    where: { name: { in: ['ChickResDemo', 'Chick Res Branch 2'] } },
    select: { id: true },
  });
  if (staleStores.length > 0) {
    const staleIds = staleStores.map((s) => s.id);
    await prisma.inventoryLedgerEntry.deleteMany({ where: { storeId: { in: staleIds } } });
    await prisma.stockLot.deleteMany({ where: { storeId: { in: staleIds } } });
    await prisma.goodsReceipt.deleteMany({ where: { storeId: { in: staleIds } } });
    await prisma.recipeRevision.deleteMany({ where: { storeId: { in: staleIds } } });
    await prisma.ingredient.deleteMany({ where: { storeId: { in: staleIds } } });
    await prisma.supplier.deleteMany({ where: { storeId: { in: staleIds } } });
    await prisma.inventoryLocation.deleteMany({ where: { storeId: { in: staleIds } } });
    await prisma.store.deleteMany({ where: { id: { in: staleIds } } });
  }
  await prisma.user.deleteMany({ where: { email: { endsWith: '@example.test' } } });

  let mainStore = await prisma.store.findFirst({ where: { name: 'Chick Res Main' } });
  if (!mainStore) {
    mainStore = await prisma.store.create({
      data: {
        name: 'Chick Res Main',
        address: '123 Nguyễn Huệ, Quận 1, TP.HCM',
        phone: '0901234567',
      },
    });
  }

  const demoAccounts = [
    { email: 'superadmin@chickres.local', role: UserRole.ADMIN, isPlatformAdmin: true },
    { email: 'manager@chickres.local', role: UserRole.MANAGER, isPlatformAdmin: false },
    { email: 'cashier@chickres.local', role: UserRole.CASHIER, isPlatformAdmin: false },
    { email: 'kitchen@chickres.local', role: UserRole.KITCHEN, isPlatformAdmin: false },
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
    await prisma.storeMember.upsert({
      where: { userId_storeId: { userId: user.id, storeId: mainStore.id } },
      update: {},
      create: { userId: user.id, storeId: mainStore.id },
    });
  }

  const defaultTables = [
    { code: 'B-01', name: 'Bàn 1 (Cửa sổ)', capacity: 2 },
    { code: 'B-02', name: 'Bàn 2 (Cửa sổ)', capacity: 4 },
    { code: 'B-03', name: 'Bàn 3 (Sảnh chính)', capacity: 4 },
    { code: 'B-04', name: 'Bàn 4 (Gia đình)', capacity: 6 },
    { code: 'VIP-01', name: 'Phòng VIP 1', capacity: 8 },
    { code: 'B10', name: 'Bàn 10 (Sân vườn)', capacity: 4 },
  ];
  for (const tbl of defaultTables) {
    await prisma.diningTable.upsert({
      where: { storeId_code: { storeId: mainStore.id, code: tbl.code } },
      update: { name: tbl.name, capacity: tbl.capacity, isActive: true },
      create: {
        storeId: mainStore.id,
        code: tbl.code,
        name: tbl.name,
        capacity: tbl.capacity,
      },
    });
  }
} finally { await prisma.$disconnect(); }
