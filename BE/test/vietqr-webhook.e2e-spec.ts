import { randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { PaymentMethod, PrismaClient, UserRole } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

const callbackCredentials = { username: 'vietqr-e2e', password: 'vietqr-e2e-password' };
const callbackTokenSecret = 'vietqr-webhook-test-secret-at-least-32-characters';
const bankAccount = '0123456789';

describe('VietQR transaction-sync webhook (e2e)', () => {
  let app: INestApplication;
  let database: PrismaClient;
  let storeId: string;
  let userId: string;
  const previousEnvironment = new Map<string, string | undefined>();

  const callbackPayload = (
    orderReference: string,
    amount: number,
    overrides: Record<string, unknown> = {},
  ) => {
    const payload = {
      transactionid: randomUUID(),
      transactiontime: String(Date.now()),
      referencenumber: `MB-${randomUUID()}`,
      amount,
      content: orderReference,
      bankaccount: bankAccount,
      transType: 'C',
      orderId: orderReference,
      ...overrides,
    };
    return payload;
  };

  const callbackToken = async () => {
    const basic = Buffer.from(
      `${callbackCredentials.username}:${callbackCredentials.password}`,
    ).toString('base64');
    const response = await request(app.getHttpServer())
      .post('/api/v1/webhooks/vietqr/token-generate')
      .set('authorization', `Basic ${basic}`)
      .expect(201);
    return response.body.access_token as string;
  };

  beforeAll(async () => {
    for (const [key, value] of Object.entries({
      VIETQR_CALLBACK_USERNAME: callbackCredentials.username,
      VIETQR_CALLBACK_PASSWORD: callbackCredentials.password,
      VIETQR_CALLBACK_TOKEN_SECRET: callbackTokenSecret,
      VIETQR_BANK_ACCOUNT: bankAccount,
    })) {
      previousEnvironment.set(key, process.env[key]);
      process.env[key] = value;
    }
    database = new PrismaClient();
    await database.$connect();
    const suffix = randomUUID();
    const store = await database.store.create({ data: { name: `VietQR e2e ${suffix}` } });
    storeId = store.id;
    const user = await database.user.create({
      data: {
        email: `vietqr-e2e-${suffix}@example.test`,
        passwordHash: 'not-used-by-webhook',
        role: UserRole.CASHIER,
      },
    });
    userId = user.id;
    await database.shift.create({ data: { storeId, openedById: userId, openingCash: 0 } });
    const fixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = fixture.createNestApplication();
    app.getHttpAdapter().getInstance().set('trust proxy', true);
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await database?.store.deleteMany({ where: { id: storeId } });
    await database?.user.deleteMany({ where: { id: userId } });
    await database?.$disconnect();
    for (const [key, value] of previousEnvironment) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('captures a signed MB credit once and creates one fulfillment ticket', async () => {
    const order = await database.order.create({
      data: {
        storeId,
        createdById: userId,
        totalAmount: 49000,
        items: {
          create: {
            productId: randomUUID(),
            variantId: randomUUID(),
            productName: 'Webhook chicken',
            variantName: 'Regular',
            unitPrice: 49000,
            quantity: 1,
            optionsSnapshot: [],
            lineTotal: 49000,
          },
        },
      },
    });
    const orderReference = `CR${order.id.replaceAll('-', '').slice(0, 11).toUpperCase()}`;
    await database.vietQrPaymentRequest.create({
      data: {
        storeId,
        orderId: order.id,
        orderReference,
        amount: 49000,
        content: orderReference,
        qrCode: '000201010212',
      },
    });
    const payload = callbackPayload(orderReference, 49000);
    const authorization = `Bearer ${await callbackToken()}`;

    await request(app.getHttpServer())
      .post('/api/v1/webhooks/vietqr/transaction-sync')
      .set('authorization', authorization)
      .send(payload)
      .expect(200)
      .expect((response) => expect(response.body.error).toBe(false));
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/vietqr/transaction-sync')
      .set('authorization', authorization)
      .send(payload)
      .expect(200)
      .expect((response) => expect(response.body.error).toBe(false));

    const paid = await database.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { payments: true, fulfillmentTicket: true },
    });
    expect(paid.status).toBe('PAID');
    expect(paid.payments).toHaveLength(1);
    expect(paid.payments[0]).toMatchObject({
      method: PaymentMethod.QR_VIETQR,
      amount: 49000,
      providerTransactionId: payload.transactionid,
    });
    expect(paid.fulfillmentTicket).toMatchObject({ status: 'QUEUED' });
  });

  it('rejects a callback without a valid Bearer token', async () => {
    const order = await database.order.create({
      data: { storeId, createdById: userId, totalAmount: 29000 },
    });
    const orderReference = `CR${order.id.replaceAll('-', '').slice(0, 11).toUpperCase()}`;
    await database.vietQrPaymentRequest.create({
      data: {
        storeId,
        orderId: order.id,
        orderReference,
        amount: 29000,
        content: orderReference,
        qrCode: '000201010212',
      },
    });
    const payload = callbackPayload(orderReference, 29000);

    await request(app.getHttpServer())
      .post('/api/v1/webhooks/vietqr/transaction-sync')
      .send(payload)
      .expect(401);

    const untouched = await database.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { payments: true },
    });
    expect(untouched.status).toBe('AWAITING_PAYMENT');
    expect(untouched.payments).toHaveLength(0);
  });

  it('throttles token issuance after five attempts per client IP', async () => {
    const basic = Buffer.from(
      `${callbackCredentials.username}:${callbackCredentials.password}`,
    ).toString('base64');
    const headers = {
      authorization: `Basic ${basic}`,
      'x-forwarded-for': '198.51.100.41',
    };
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/v1/webhooks/vietqr/token-generate')
        .set(headers)
        .expect(201);
    }
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/vietqr/token-generate')
      .set(headers)
      .expect(429);
  });

  it('throttles transaction-sync after thirty requests per client IP', async () => {
    const headers = { 'x-forwarded-for': '198.51.100.42' };
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/v1/webhooks/vietqr/transaction-sync')
        .set(headers)
        .send({})
        .expect(400);
    }
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/vietqr/transaction-sync')
      .set(headers)
      .send({})
      .expect(429);
  });
});
