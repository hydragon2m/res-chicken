import { randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaClient, UserRole } from '@prisma/client';
import argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('Reports, Dashboard Metrics, and Store Settings (e2e)', () => {
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
        key: `reports-e2e-${suffix}`,
        name: 'Reports e2e',
        permissions: {
          create: permissions.map((p) => ({ permissionId: p.id })),
        },
      },
    });
    roleId = role.id;
    const store = await database.store.create({
      data: {
        name: `Reports Store ${suffix}`,
        phone: '0281234567',
        address: '456 Võ Văn Tần, Q3',
        taxRate: 0.08,
      },
    });
    storeId = store.id;

    const user = await database.user.create({
      data: {
        email: `reports-admin-${suffix}@example.test`,
        passwordHash: await argon2.hash('reports-password'),
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
      .send({ email: user.email, password: 'reports-password' })
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

  it('queries reports, real dashboard metrics, exports CSV, and updates operational settings', async () => {
    const auth = { authorization: `Bearer ${token}` };

    // 1. Create product & order to generate real sales data
    const cat = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set(auth)
      .send({ storeId, name: 'Báo cáo gà' })
      .expect(201);
    const prod = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set(auth)
      .send({
        storeId,
        categoryId: cat.body.id,
        name: 'Gà rán phô mai',
        variants: [{ name: 'Suất 1 người' }],
      })
      .expect(201);
    const variantId = prod.body.variants[0].id as string;
    await request(app.getHttpServer())
      .post('/api/v1/price-schedules')
      .set(auth)
      .send({
        variantId,
        amount: 60000,
        startsAt: new Date(Date.now() - 60_000).toISOString(),
      })
      .expect(201);

    const _shift = await request(app.getHttpServer())
      .post('/api/v1/shifts/open')
      .set({ ...auth, 'idempotency-key': `shift-rep-${randomUUID()}` })
      .send({ storeId, openingCash: 500000 })
      .expect(201);

    const order = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set({ ...auth, 'idempotency-key': `order-rep-${randomUUID()}` })
      .send({
        storeId,
        items: [{ variantId, quantity: 2, optionIds: [] }],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/orders/${order.body.id}/payments`)
      .set({ ...auth, 'idempotency-key': `pay-rep-${randomUUID()}` })
      .send({ method: 'CASH', amount: order.body.totalAmount })
      .expect(201);

    // 2. Query Sales Report
    const sales = await request(app.getHttpServer())
      .get(`/api/v1/reports/sales?storeId=${storeId}`)
      .set(auth)
      .expect(200);

    expect(sales.body.orderCount).toBeGreaterThanOrEqual(1);
    expect(sales.body.totalRevenue).toBeGreaterThanOrEqual(120000);

    // 3. Query Top Selling
    const topSelling = await request(app.getHttpServer())
      .get(`/api/v1/reports/top-selling?storeId=${storeId}`)
      .set(auth)
      .expect(200);

    expect(topSelling.body.length).toBeGreaterThanOrEqual(1);
    expect(topSelling.body[0].name).toContain('Gà rán phô mai');

    // 4. Query Dashboard Metrics (real queries matching Shadcn UI Kit)
    const metrics = await request(app.getHttpServer())
      .get(`/api/v1/reports/dashboard-metrics?storeId=${storeId}`)
      .set(auth)
      .expect(200);

    expect(metrics.body).toHaveProperty('currentRevenue');
    expect(metrics.body).toHaveProperty('revenueBarData');
    expect(metrics.body).toHaveProperty('paymentSourceData');
    expect(metrics.body.revenueBarData).toHaveLength(6);

    // 5. Export Sales CSV
    const salesCsv = await request(app.getHttpServer())
      .get(`/api/v1/reports/export/sales?storeId=${storeId}`)
      .set(auth)
      .expect(200);

    expect(salesCsv.headers['content-type']).toContain('text/csv');
    expect(salesCsv.text).toContain('Mã đơn');
    expect(salesCsv.text).toContain('120000');

    // 6. Test Store Settings update
    const updateSettingsRes = await request(app.getHttpServer())
      .put(`/api/v1/settings/store/${storeId}`)
      .set(auth)
      .send({
        phone: '0909999888',
        address: '789 Nguyễn Thị Minh Khai',
        taxRate: 0.1,
        taxCode: '0312345678',
        receiptHeader: 'CHICK RES - GÀ RÁN GIÒN RỤM',
        receiptFooter: 'Cảm ơn quý khách và hẹn gặp lại!',
      })
      .expect(200);

    expect(updateSettingsRes.body).toMatchObject({
      phone: '0909999888',
      taxRate: 0.1,
      taxCode: '0312345678',
      receiptHeader: 'CHICK RES - GÀ RÁN GIÒN RỤM',
    });
  });
});
