import * as argon2 from 'argon2';
import { PrismaClient, UserRole } from '@prisma/client';

const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.SUPER_ADMIN_PASSWORD;

if (!email || !password || password.length < 12) {
  throw new Error(
    'Set SUPER_ADMIN_EMAIL and a SUPER_ADMIN_PASSWORD of at least 12 characters.',
  );
}

const prisma = new PrismaClient();

try {
  const role = await prisma.role.findUnique({ where: { key: UserRole.ADMIN } });
  if (!role) throw new Error('Roles are not configured. Run npm run identity:seed first.');

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash: await argon2.hash(password),
      role: UserRole.ADMIN,
      isPlatformAdmin: true,
      roleLinks: { create: { roleId: role.id } },
    },
    update: {
      passwordHash: await argon2.hash(password),
      role: UserRole.ADMIN,
      isActive: true,
      isPlatformAdmin: true,
      authVersion: { increment: 1 },
    },
  });

  await prisma.userRoleLink.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id },
  });
  console.log(`Platform Super Admin is ready for ${email}.`);
} finally {
  await prisma.$disconnect();
}
