import * as argon2 from 'argon2';
import { PrismaClient, UserRole } from '@prisma/client';

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const storeName = process.env.ADMIN_STORE_NAME?.trim() || 'Main Store';

if (!email || !password || password.length < 12) {
  throw new Error('Set ADMIN_EMAIL and an ADMIN_PASSWORD of at least 12 characters.');
}

const prisma = new PrismaClient();
try {
  const store = (await prisma.store.findFirst()) ?? (await prisma.store.create({ data: { name: storeName } }));
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, passwordHash: await argon2.hash(password), role: UserRole.ADMIN },
    update: { passwordHash: await argon2.hash(password), role: UserRole.ADMIN, isActive: true, authVersion: { increment: 1 } },
  });
  const adminRole = await prisma.role.findUnique({ where: { key: 'ADMIN' } });
  if (!adminRole) throw new Error('Admin role is not configured. Run npm run identity:seed first.');
  await prisma.userRoleLink.upsert({ where: { userId_roleId: { userId: user.id, roleId: adminRole.id } }, create: { userId: user.id, roleId: adminRole.id }, update: {} });
  await prisma.storeMember.upsert({ where: { userId_storeId: { userId: user.id, storeId: store.id } }, create: { userId: user.id, storeId: store.id }, update: {} });
  console.log(`Admin account is ready for ${email}.`);
} finally {
  await prisma.$disconnect();
}
