import { randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaClient, UserRole } from '@prisma/client';
import argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('Promotions and Vouchers flow (e2e)', () => {
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
    const permissions = await database.permission.findMany();
    const role = await database.role.create({
      data: {
        key: `promo-e2e-${suffix}`,
        name: 'Promo e2e',
        permissions: {
          create: permissions.map((p) => ({ permissionId: p.id })),
        },
      },
    });
    roleId = role.id;
    const store = await database.store.create({ data: { name: `Promo store ${suffix}` } });
    storeId = store.id;

    const user = await database.user.create({
      data: {
        email: `promo-${suffix}@example.test`,
        passwordHash: await argon2.hash('promo-password'),
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

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'promo-password' })
      .expect(201);
    token = login.body.accessToken as string;
  });

  afterAll(async () => {
    await app?.close();
    await database?.store.deleteMany({ where: { id: storeId } });
    await database?.user.deleteMany({ where: { id: userId } });
    await database?.role.deleteMany({ where: { id: roleId } });
    await database?.$disconnect();
  });

  it('manages campaign, generates vouchers, validates discount and applies voucher to order', async () => {
    const auth = { authorization: `Bearer ${token}` };

    // 1. Create a category, product and price schedule for ordering
    const cat = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set(auth)
      .send({ storeId, name: 'Gà rán giòn' })
      .expect(201);
    const prod = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set(auth)
      .send({
        storeId,
        categoryId: cat.body.id,
        name: 'Combo gà cay',
        variants: [{ name: 'Phần 2 miếng' }],
      })
      .expect(201);
    const variantId = prod.body.variants[0].id as string;
    await request(app.getHttpServer())
      .post('/api/v1/price-schedules')
      .set(auth)
      .send({
        variantId,
        amount: 100000,
        startsAt: new Date(Date.now() - 60_000).toISOString(),
      })
      .expect(201);

    // 2. Create campaign (20% discount, max 30,000đ, min order 50,000đ)
    const campaign = await request(app.getHttpServer())
      .post('/api/v1/campaigns')
      .set(auth)
      .send({
        storeId,
        name: 'Khai xuân rực rỡ 20%',
        discountType: 'PERCENTAGE',
        discountValue: 20,
        minOrderAmount: 50000,
        maxDiscountAmount: 30000,
        startsAt: new Date(Date.now() - 3600000).toISOString(),
      })
      .expect(201);

    // 3. Publish campaign
    await request(app.getHttpServer())
      .post(`/api/v1/campaigns/${campaign.body.id}/publish`)
      .set(auth)
      .expect(201);

    // 4. Generate custom voucher
    const voucherCode = `CHICKTEST-${randomUUID().slice(0, 4).toUpperCase()}`;
    await request(app.getHttpServer())
      .post(`/api/v1/campaigns/${campaign.body.id}/vouchers`)
      .set(auth)
      .send({
        customCodes: [voucherCode],
        redemptionQuota: 5,
      })
      .expect(201);

    // 5. Public customer validates voucher
    const validateRes = await request(app.getHttpServer())
      .post('/api/v1/campaigns/validate-voucher')
      .send({
        storeId,
        code: voucherCode,
        subtotalAmount: 100000,
      })
      .expect(201);

    expect(validateRes.body).toMatchObject({
      valid: true,
      code: voucherCode,
      discountAmount: 20000, // 20% of 100k
      finalAmount: 80000,
    });

    // 6. Create order applying the voucher
    const orderRes = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set({ ...auth, 'idempotency-key': `order-promo-${randomUUID()}` })
      .send({
        storeId,
        voucherCode,
        items: [{ variantId, quantity: 1, optionIds: [] }],
      })
      .expect(201);

    expect(orderRes.body).toMatchObject({
      subtotalAmount: 100000,
      discountAmount: 20000,
      taxAmount: 6400,
      totalAmount: 86400,
    });
    expect(orderRes.body.voucherRedemption).toMatchObject({
      discountAmount: 20000,
      status: 'RESERVED',
    });
  });
});
