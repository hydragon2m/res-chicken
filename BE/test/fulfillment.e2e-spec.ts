import { randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaClient, UserRole } from '@prisma/client';
import argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('Fulfillment KDS flow (e2e)', () => {
  let app: INestApplication;
  let database: PrismaClient;
  let storeId: string;
  let userId: string;
  let roleId: string;
  let token: string;

  beforeAll(async () => {
    database = new PrismaClient();
    await database.$connect();
    const suffix = randomUUID();
    const keys = [
      'catalog.read',
      'catalog.manage',
      'orders.create',
      'orders.read',
      'shifts.open',
      'payments.capture',
      'fulfillment.read',
      'fulfillment.manage',
    ];
    const permissions = await Promise.all(
      keys.map((key) =>
        database.permission.upsert({ where: { key }, update: {}, create: { key } }),
      ),
    );
    const role = await database.role.create({
      data: {
        key: `fulfillment-e2e-${suffix}`,
        name: 'Fulfillment e2e',
        permissions: { create: permissions.map((permission) => ({ permissionId: permission.id })) },
      },
    });
    roleId = role.id;
    const store = await database.store.create({ data: { name: `Fulfillment e2e ${suffix}` } });
    storeId = store.id;
    const user = await database.user.create({
      data: {
        email: `fulfillment-e2e-${suffix}@example.test`,
        passwordHash: await argon2.hash('fulfillment-e2e-password'),
        role: UserRole.ADMIN,
        memberships: { create: { storeId } },
        roleLinks: { create: { roleId } },
      },
    });
    userId = user.id;
    const fixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = fixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    token = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'fulfillment-e2e-password' })
        .expect(201)
    ).body.accessToken as string;
  });

  afterAll(async () => {
    await app?.close();
    await database?.store.deleteMany({ where: { id: storeId } });
    await database?.user.deleteMany({ where: { id: userId } });
    await database?.role.deleteMany({ where: { id: roleId } });
    await database?.$disconnect();
  });

  it('creates one queued snapshot on payment and advances idempotently through KDS', async () => {
    const auth = { authorization: `Bearer ${token}` };
    const category = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set(auth)
      .send({ storeId, name: `KDS ${randomUUID()}` })
      .expect(201);
    const product = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set(auth)
      .send({
        storeId,
        categoryId: category.body.id,
        name: 'KDS chicken',
        variants: [{ name: 'Original' }],
      })
      .expect(201);
    const variantId = product.body.variants[0].id as string;
    await request(app.getHttpServer())
      .post('/api/v1/price-schedules')
      .set(auth)
      .send({ variantId, amount: 59000, startsAt: new Date(Date.now() - 60_000).toISOString() })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/ca-lam-viec/open')
      .set({ ...auth, 'idempotency-key': 'kds-open' })
      .send({ storeId, openingCash: 0 })
      .expect(201);
    const order = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set({ ...auth, 'idempotency-key': 'kds-order' })
      .send({ storeId, items: [{ variantId, quantity: 2, optionIds: [] }] })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/orders/${order.body.id}/payments`)
      .set({ ...auth, 'idempotency-key': 'kds-payment' })
      .send({ method: 'QR_MANUAL', amount: order.body.totalAmount })
      .expect(201);
    const queued = await request(app.getHttpServer())
      .get(`/api/v1/dieu-phoi-bep/tickets?storeId=${storeId}`)
      .set(auth)
      .expect(200);
    expect(queued.body).toHaveLength(1);
    expect(queued.body[0]).toMatchObject({
      orderId: order.body.id,
      status: 'QUEUED',
      items: [{ productName: 'KDS chicken', variantName: 'Original', quantity: 2 }],
    });
    const ticketId = queued.body[0].id as string;
    const transition = async (status: string) =>
      request(app.getHttpServer())
        .post(`/api/v1/dieu-phoi-bep/tickets/${ticketId}/transition`)
        .set(auth)
        .send({ status });
    expect((await transition('PREPARING')).body).toMatchObject({
      status: 'PREPARING',
      preparingById: userId,
    });
    const preparingReplay = await transition('PREPARING');
    expect(preparingReplay.status).toBe(201);
    expect(preparingReplay.body.events).toHaveLength(2);
    expect((await transition('READY')).body).toMatchObject({ status: 'READY', readyById: userId });
    expect((await transition('HANDED_OVER')).body).toMatchObject({
      status: 'HANDED_OVER',
      handedOverById: userId,
    });
    expect((await transition('HANDED_OVER')).body.events).toHaveLength(4);
    await request(app.getHttpServer())
      .post(`/api/v1/dieu-phoi-bep/tickets/${ticketId}/transition`)
      .set(auth)
      .send({ status: 'PREPARING' })
      .expect(409);
  });
});
