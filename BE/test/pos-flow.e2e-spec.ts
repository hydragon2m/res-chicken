import { randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaClient, UserRole } from '@prisma/client';
import argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('POS cash flow (e2e)', () => {
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
      'orders.cancel',
      'shifts.read',
      'shifts.open',
      'shifts.close',
      'shifts.adjust',
      'payments.capture',
      'payments.refund',
      'fulfillment.read',
      'reports.read',
    ];
    const permissions = await Promise.all(
      keys.map((key) =>
        database.permission.upsert({
          where: { key },
          update: {},
          create: { key },
        }),
      ),
    );
    const role = await database.role.create({
      data: {
        key: `pos-e2e-${suffix}`,
        name: 'POS e2e',
        permissions: {
          create: permissions.map((permission) => ({
            permissionId: permission.id,
          })),
        },
      },
    });
    roleId = role.id;
    const store = await database.store.create({
      data: { name: `POS e2e ${suffix}`, taxRate: 0 },
    });
    storeId = store.id;
    const user = await database.user.create({
      data: {
        email: `pos-e2e-${suffix}@example.test`,
        passwordHash: await argon2.hash('pos-e2e-password'),
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
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    token = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'pos-e2e-password' })
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

  it('opens a shift, captures idempotently, reconciles cash, refunds, cancels, and closes', async () => {
    const auth = { authorization: `Bearer ${token}` };
    const category = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set(auth)
      .send({ storeId, name: `POS ${randomUUID()}` })
      .expect(201);
    const product = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set(auth)
      .send({
        storeId,
        categoryId: category.body.id,
        name: 'Cash chicken',
        variants: [{ name: 'Regular' }],
      })
      .expect(201);
    const variantId = product.body.variants[0].id as string;
    await request(app.getHttpServer())
      .post('/api/v1/price-schedules')
      .set(auth)
      .send({
        variantId,
        amount: 49000,
        startsAt: new Date(Date.now() - 60_000).toISOString(),
      })
      .expect(201);
    const menu = await request(app.getHttpServer())
      .get(`/api/v1/menu?storeId=${storeId}`)
      .set(auth)
      .expect(200);
    expect(
      menu.body.flatMap((category: { products: unknown[] }) => category.products),
    ).toHaveLength(1);
    const [firstOpen, secondOpen] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/shifts/open')
        .set({ ...auth, 'idempotency-key': 'open-pos-flow-a' })
        .send({ storeId, openingCash: 100000 }),
      request(app.getHttpServer())
        .post('/api/v1/shifts/open')
        .set({ ...auth, 'idempotency-key': 'open-pos-flow-b' })
        .send({ storeId, openingCash: 100000 }),
    ]);
    expect([firstOpen.status, secondOpen.status].sort()).toEqual([201, 409]);
    const shift = firstOpen.status === 201 ? firstOpen : secondOpen;
    const currentShift = await request(app.getHttpServer())
      .get(`/api/v1/shifts/current?storeId=${storeId}`)
      .set(auth)
      .expect(200);
    expect(currentShift.body.id).toBe(shift.body.id);
    const orderRequest = {
      storeId,
      items: [{ variantId, quantity: 1, optionIds: [] }],
    };
    const firstOrder = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set({ ...auth, 'idempotency-key': 'create-pos-flow' })
      .send(orderRequest)
      .expect(201);
    const replayOrder = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set({ ...auth, 'idempotency-key': 'create-pos-flow' })
      .send(orderRequest)
      .expect(201);
    expect(replayOrder.body.id).toBe(firstOrder.body.id);
    const paymentRequest = { method: 'CASH', amount: 49000 };
    const payment = await request(app.getHttpServer())
      .post(`/api/v1/orders/${firstOrder.body.id}/payments`)
      .set({ ...auth, 'idempotency-key': 'pay-pos-flow' })
      .send(paymentRequest)
      .expect(201);
    const replayPayment = await request(app.getHttpServer())
      .post(`/api/v1/orders/${firstOrder.body.id}/payments`)
      .set({ ...auth, 'idempotency-key': 'pay-pos-flow' })
      .send(paymentRequest)
      .expect(201);
    expect(replayPayment.body.id).toBe(payment.body.id);
    expect(payment.body.order).toMatchObject({
      id: firstOrder.body.id,
      status: 'PAID',
      payments: [expect.objectContaining({ id: payment.body.id, method: 'CASH', amount: 49000 })],
    });
    const adjusted = await request(app.getHttpServer())
      .post(`/api/v1/shifts/${shift.body.id}/adjustments`)
      .set({ ...auth, 'idempotency-key': 'adjust-pos-flow' })
      .send({ amount: 500, note: 'Till count' })
      .expect(201);
    expect(
      adjusted.body.cashMovements.reduce(
        (sum: number, movement: { amount: number }) => sum + movement.amount,
        0,
      ),
    ).toBe(149500);
    await request(app.getHttpServer())
      .post(`/api/v1/payments/${payment.body.id}/refund`)
      .set({ ...auth, 'idempotency-key': 'refund-pos-flow' })
      .send({ note: 'Customer changed mind' })
      .expect(201);
    const refundedTicket = await request(app.getHttpServer())
      .get(`/api/v1/fulfillment/tickets?storeId=${storeId}`)
      .set(auth)
      .expect(200);
    expect(refundedTicket.body).toHaveLength(1);
    expect(refundedTicket.body[0]).toMatchObject({
      status: 'VOIDED',
      voidedById: userId,
      voidReason: 'Payment refunded: Customer changed mind',
    });
    const preparedOrder = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set({ ...auth, 'idempotency-key': 'prepared-order-pos-flow' })
      .send(orderRequest)
      .expect(201);
    const preparedPayment = await request(app.getHttpServer())
      .post(`/api/v1/orders/${preparedOrder.body.id}/payments`)
      .set({ ...auth, 'idempotency-key': 'prepared-payment-pos-flow' })
      .send(paymentRequest)
      .expect(201);
    await database.fulfillmentTicket.update({
      where: { orderId: preparedOrder.body.id },
      data: { status: 'PREPARING', preparingAt: new Date(), preparingById: userId },
    });
    await request(app.getHttpServer())
      .post(`/api/v1/payments/${preparedPayment.body.id}/refund`)
      .set({ ...auth, 'idempotency-key': 'refund-prepared-pos-flow' })
      .send({ note: 'Too late to refund' })
      .expect(409);
    const nonRefunded = await database.order.findUniqueOrThrow({
      where: { id: preparedOrder.body.id },
      include: { payments: true },
    });
    expect(nonRefunded.status).toBe('PAID');
    expect(nonRefunded.payments[0]?.status).toBe('CAPTURED');
    const cancelled = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set({ ...auth, 'idempotency-key': 'cancel-source-pos-flow' })
      .send(orderRequest)
      .expect(201);
    const cancelledResponse = await request(app.getHttpServer())
      .post(`/api/v1/orders/${cancelled.body.id}/cancel`)
      .set({ ...auth, 'idempotency-key': 'cancel-pos-flow' })
      .send({ note: 'Customer cancelled at POS' })
      .expect(201);
    expect(cancelledResponse.body).toMatchObject({
      status: 'CANCELLED',
      cancelledById: userId,
      cancellationNote: 'Customer cancelled at POS',
    });
    const raceOrder = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set({ ...auth, 'idempotency-key': 'race-order-pos-flow' })
      .send(orderRequest)
      .expect(201);
    const [closeRace, paymentRace] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/shifts/${shift.body.id}/close`)
        .set({ ...auth, 'idempotency-key': 'close-pos-flow' })
        .send({ declaredCash: 100500 }),
      request(app.getHttpServer())
        .post(`/api/v1/orders/${raceOrder.body.id}/payments`)
        .set({ ...auth, 'idempotency-key': 'race-payment-pos-flow' })
        .send(paymentRequest),
    ]);
    expect(closeRace.status).toBe(201);
    expect([201, 409]).toContain(paymentRace.status);
    const paymentWon = paymentRace.status === 201;
    expect(closeRace.body).toMatchObject({
      status: 'CLOSED',
      expectedCash: paymentWon ? 198500 : 149500,
      declaredCash: 100500,
      variance: paymentWon ? -98000 : -49000,
    });

    const secondShift = await request(app.getHttpServer())
      .post('/api/v1/shifts/open')
      .set({ ...auth, 'idempotency-key': 'second-open-pos-flow' })
      .send({ storeId, openingCash: 1000 })
      .expect(201);
    const [firstClose, secondClose] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/shifts/${secondShift.body.id}/close`)
        .set({ ...auth, 'idempotency-key': 'first-close-pos-flow' })
        .send({ declaredCash: 1000 }),
      request(app.getHttpServer())
        .post(`/api/v1/shifts/${secondShift.body.id}/close`)
        .set({ ...auth, 'idempotency-key': 'second-close-pos-flow' })
        .send({ declaredCash: 2000 }),
    ]);
    expect([firstClose.status, secondClose.status].sort()).toEqual([201, 409]);
    const winner = firstClose.status === 201 ? firstClose : secondClose;
    const persisted = await database.shift.findUniqueOrThrow({
      where: { id: secondShift.body.id },
    });
    expect(persisted.declaredCash).toBe(winner.body.declaredCash);
    const activity = await request(app.getHttpServer())
      .get(`/api/v1/reports/activity?storeId=${storeId}`)
      .set(auth)
      .expect(200);
    expect(activity.body.map((event: { action: string }) => event.action)).toEqual(
      expect.arrayContaining([
        'ORDER_CREATED',
        'PAYMENT_CAPTURED',
        'PAYMENT_REFUNDED',
        'TICKET_VOIDED',
        'SHIFT_CLOSED',
      ]),
    );
  }, 30_000);
});
