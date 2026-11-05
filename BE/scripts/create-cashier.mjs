import * as argon2 from 'argon2';
import { PrismaClient, UserRole } from '@prisma/client';

const email = process.env.CASHIER_EMAIL?.trim().toLowerCase();
const password = process.env.CASHIER_PASSWORD;
const storeName = process.env.CASHIER_STORE_NAME?.trim() || 'Chick Res Main';

if (!email || !password || password.length < 12) {
  throw new Error('Set CASHIER_EMAIL and a CASHIER_PASSWORD of at least 12 characters.');
}

const prisma = new PrismaClient();
try {
  const [store, cashierRole] = await Promise.all([
    prisma.store.findFirst({ where: { name: storeName } }),
    prisma.role.findUnique({ where: { key: 'CASHIER' } }),
  ]);
  if (!store) throw new Error(`Store "${storeName}" was not found.`);
  if (!cashierRole) throw new Error('Cashier role is not configured. Run npm run identity:seed first.');

  const passwordHash = await argon2.hash(password);
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, passwordHash, role: UserRole.CASHIER },
    update: { passwordHash, role: UserRole.CASHIER, isActive: true, authVersion: { increment: 1 } },
  });
  await prisma.storeMember.upsert({
    where: { userId_storeId: { userId: user.id, storeId: store.id } },
    create: { userId: user.id, storeId: store.id },
    update: {},
  });
  await prisma.userRoleLink.deleteMany({ where: { userId: user.id, roleId: { not: cashierRole.id } } });
  await prisma.userRoleLink.upsert({
    where: { userId_roleId: { userId: user.id, roleId: cashierRole.id } },
    create: { userId: user.id, roleId: cashierRole.id },
    update: {},
  });
  console.log(`Cashier account is ready for ${email}.`);
} finally {
  await prisma.$disconnect();
}
