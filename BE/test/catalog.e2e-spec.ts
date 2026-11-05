import { randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaClient, UserRole } from '@prisma/client';
import argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('Catalog API (e2e)', () => {
  let app: INestApplication;
  let database: PrismaClient;
  let storeA: string;
  let storeB: string;
  let token: string;
  let userId: string;
  let roleId: string;

  beforeAll(async () => {
    database = new PrismaClient();
    await database.$connect();
    const suffix = randomUUID();
    const readPermission = await database.permission.upsert({
      where: { key: 'catalog.read' },
      update: {},
      create: { key: 'catalog.read' },
    });
    const managePermission = await database.permission.upsert({
      where: { key: 'catalog.manage' },
      update: {},
      create: { key: 'catalog.manage' },
    });
    const identityManagePermission = await database.permission.upsert({
      where: { key: 'identity.manage' },
      update: {},
      create: { key: 'identity.manage' },
    });
    const role = await database.role.create({
      data: {
        key: `catalog-e2e-${suffix}`,
        name: 'Catalog e2e',
        permissions: {
          create: [
            { permissionId: readPermission.id },
            { permissionId: managePermission.id },
            { permissionId: identityManagePermission.id },
          ],
        },
      },
    });
    roleId = role.id;
    const firstStore = await database.store.create({
      data: { name: `Catalog e2e A ${suffix}` },
    });
    const secondStore = await database.store.create({
      data: { name: `Catalog e2e B ${suffix}` },
    });
    storeA = firstStore.id;
    storeB = secondStore.id;
    const user = await database.user.create({
      data: {
        email: `catalog-e2e-${suffix}@example.test`,
        passwordHash: await argon2.hash('catalog-e2e-password'),
        role: UserRole.ADMIN,
        memberships: { create: { storeId: storeA } },
        roleLinks: { create: { roleId } },
      },
    });
    userId = user.id;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'catalog-e2e-password' })
      .expect(201);
    token = login.body.accessToken as string;
  });

  afterAll(async () => {
    await app?.close();
    if (database) {
      await database.user.deleteMany({ where: { id: userId } });
      await database.store.deleteMany({
        where: { id: { in: [storeA, storeB] } },
      });
      await database.role.deleteMany({ where: { id: roleId } });
      await database.$disconnect();
    }
  });

  it('returns 401 without a bearer token and 403 outside the actor store', async () => {
    await request(app.getHttpServer()).get(`/api/v1/categories?storeId=${storeA}`).expect(401);
    await request(app.getHttpServer())
      .get(`/api/v1/categories?storeId=${storeB}`)
      .set('authorization', `Bearer ${token}`)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/categories?storeId=not-a-uuid')
      .set('authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('rejects creating a user with no store scope', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/users')
      .set('authorization', `Bearer ${token}`)
      .send({
        email: `empty-scope-${randomUUID()}@example.test`,
        password: 'valid-password',
        role: 'CASHIER',
        storeIds: [],
      })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/v1/auth/users/${randomUUID()}`)
      .set('authorization', `Bearer ${token}`)
      .send({ storeIds: [] })
      .expect(400);
  });

  it('rejects overlapping schedules, including concurrent API writes', async () => {
    const category = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('authorization', `Bearer ${token}`)
      .send({ storeId: storeA, name: `Meals ${randomUUID()}` })
      .expect(201);
    const product = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('authorization', `Bearer ${token}`)
      .send({
        storeId: storeA,
        categoryId: category.body.id,
        name: `Chicken ${randomUUID()}`,
        variants: [{ name: 'Regular' }],
      })
      .expect(201);
    const variantId = product.body.variants[0].id as string;
    const schedule = {
      variantId,
      amount: 49000,
      startsAt: '2030-01-01T00:00:00.000Z',
      endsAt: '2030-02-01T00:00:00.000Z',
    };
    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/price-schedules')
        .set('authorization', `Bearer ${token}`)
        .send(schedule),
      request(app.getHttpServer())
        .post('/api/v1/price-schedules')
        .set('authorization', `Bearer ${token}`)
        .send(schedule),
    ]);
    expect([first.status, second.status].sort()).toEqual([201, 409]);
  });

  it('returns only active, in-stock products with an effective price in the POS menu', async () => {
    const category = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('authorization', `Bearer ${token}`)
      .send({ storeId: storeA, name: `Menu ${randomUUID()}` })
      .expect(201);
    const available = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('authorization', `Bearer ${token}`)
      .send({
        storeId: storeA,
        categoryId: category.body.id,
        name: 'Available',
        variants: [{ name: 'Regular' }],
      })
      .expect(201);
    const unavailable = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('authorization', `Bearer ${token}`)
      .send({
        storeId: storeA,
        categoryId: category.body.id,
        name: 'Sold out',
        variants: [{ name: 'Regular' }],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/price-schedules')
      .set('authorization', `Bearer ${token}`)
      .send({
        variantId: available.body.variants[0].id,
        amount: 49000,
        startsAt: '2020-01-01T00:00:00.000Z',
      })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/products/${unavailable.body.id}/sold-out`)
      .set('authorization', `Bearer ${token}`)
      .send({ isSoldOut: true })
      .expect(200);

    const menu = await request(app.getHttpServer())
      .get(`/api/v1/menu?storeId=${storeA}`)
      .set('authorization', `Bearer ${token}`)
      .expect(200);
    const products = menu.body.flatMap(
      (item: {
        products: Array<{
          name: string;
          variants: Array<{ prices: unknown[] }>;
        }>;
      }) => item.products,
    );
    expect(products.some((item: { name: string }) => item.name === 'Available')).toBe(true);
    expect(products.some((item: { name: string }) => item.name === 'Sold out')).toBe(false);
    expect(
      products.find((item: { name: string }) => item.name === 'Available')?.variants[0].prices,
    ).toHaveLength(1);
  });
});
