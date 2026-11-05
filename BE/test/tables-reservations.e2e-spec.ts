import { randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaClient, UserRole } from '@prisma/client';
import argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('Tables, Reservations and QR Self-Order flow (e2e)', () => {
  let app: INestApplication;
  let database: PrismaClient;
  let storeId: string;
  let store2Id: string;
  let userId: string;
  let roleId: string;
  let token: string;
  let tableId: string;
  let qrToken: string;
  let variantId: string;
  let tableStore2Id: string;

  beforeAll(async () => {
    database = new PrismaClient();
    await database.$connect();
    const suffix = randomUUID();
    const permissions = await database.permission.findMany();
    const role = await database.role.create({
      data: {
        key: `table-e2e-${suffix}`,
        name: 'Table e2e',
        permissions: {
          create: permissions.map((p) => ({ permissionId: p.id })),
        },
      },
    });
    roleId = role.id;

    // Primary store for e2e
    const store = await database.store.create({
      data: {
        name: `Table Store ${suffix}`,
        phone: '0901234567',
        address: '123 Đường Gà Rán, Quận 1',
      },
    });
    storeId = store.id;

    // Secondary store for cross-store security testing (SEC-001)
    const store2 = await database.store.create({
      data: {
        name: `Cross Store ${suffix}`,
        phone: '0909999888',
        address: '456 Lê Lợi, Quận 1',
      },
    });
    store2Id = store2.id;

    // Create table belonging to Store 2
    const tableStore2 = await database.diningTable.create({
      data: {
        storeId: store2Id,
        code: 'STORE2-T1',
        name: 'Bàn ngoài chi nhánh',
        capacity: 4,
        qrCodeToken: randomUUID(),
      },
    });
    tableStore2Id = tableStore2.id;

    const user = await database.user.create({
      data: {
        email: `table-admin-${suffix}@example.test`,
        passwordHash: await argon2.hash('table-password'),
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
      .send({ email: user.email, password: 'table-password' })
      .expect(201);
    token = login.body.accessToken as string;
  });

  afterAll(async () => {
    await app?.close();
    const storeIds = [storeId, store2Id].filter(Boolean);
    if (storeIds.length > 0) {
      await database?.store.deleteMany({ where: { id: { in: storeIds } } });
    }
    if (userId) await database?.user.deleteMany({ where: { id: userId } });
    if (roleId) await database?.role.deleteMany({ where: { id: roleId } });
    await database?.$disconnect();
  });

  it('creates tables, accepts public reservations, and processes QR table self-orders', async () => {
    const auth = { authorization: `Bearer ${token}` };

    // 1. Create a dining table in Store 1
    const tableRes = await request(app.getHttpServer())
      .post('/api/v1/tables')
      .set(auth)
      .send({
        storeId,
        code: 'B-01',
        name: 'Bàn 1 (Cửa sổ)',
        capacity: 4,
      })
      .expect(201);

    expect(tableRes.body).toMatchObject({
      code: 'B-01',
      capacity: 4,
      status: 'AVAILABLE',
    });
    tableId = tableRes.body.id as string;
    qrToken = tableRes.body.qrCodeToken as string;
    expect(qrToken).toBeDefined();

    // 2. Customer checks availability for tomorrow
    const tomorrowStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const availRes = await request(app.getHttpServer())
      .get(
        `/api/v1/reservations/public/availability?storeId=${storeId}&date=${tomorrowStr}&guestCount=2`,
      )
      .expect(200);

    expect(availRes.body.totalCapacity).toBe(4);
    expect(availRes.body.slots.length).toBeGreaterThan(0);

    // 3. Customer places a public reservation
    const bookingRes = await request(app.getHttpServer())
      .post('/api/v1/reservations/public')
      .send({
        storeId,
        customerName: 'Nguyễn Văn Khách',
        customerPhone: '0987654321',
        guestCount: 2,
        reservationTime: `${tomorrowStr}T18:00:00.000Z`,
        specialNotes: 'Bàn view đẹp nếu có',
      })
      .expect(201);

    expect(bookingRes.body.success).toBe(true);
    expect(bookingRes.body.customerName).toBe('Nguyễn Văn Khách');

    // 4. Create a product in catalog so QR customer can self-order
    const cat = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set(auth)
      .send({ storeId, name: 'Thực đơn tại bàn' })
      .expect(201);
    const prod = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set(auth)
      .send({
        storeId,
        categoryId: cat.body.id,
        name: 'Gà rán sốt mật ong',
        variants: [{ name: 'Miếng lớn' }],
      })
      .expect(201);
    variantId = prod.body.variants[0].id as string;
    await request(app.getHttpServer())
      .post('/api/v1/price-schedules')
      .set(auth)
      .send({
        variantId,
        amount: 55000,
        startsAt: new Date(Date.now() - 60_000).toISOString(),
      })
      .expect(201);

    // 5. Customer scans table QR code and fetches menu
    const qrMenuRes = await request(app.getHttpServer())
      .get(`/api/v1/ordering/table/${qrToken}`)
      .expect(200);

    expect(qrMenuRes.body.table.code).toBe('B-01');
    expect(qrMenuRes.body.categories.length).toBeGreaterThan(0);

    // 6. Customer places self-order at the table with Idempotency-Key
    const selfOrderRes = await request(app.getHttpServer())
      .post(`/api/v1/ordering/table/${qrToken}`)
      .set({ 'idempotency-key': 'e2e-order-key-initial-001' })
      .send({
        items: [{ variantId, quantity: 2, optionIds: [] }],
        customerNote: 'Cho thêm khăn giấy',
      })
      .expect(201);

    expect(selfOrderRes.body.success).toBe(true);
    expect(selfOrderRes.body.subtotalAmount).toBe(110000);
    expect(selfOrderRes.body.totalAmount).toBe(118800);
    expect(selfOrderRes.body.tableCode).toBe('B-01');

    // Verify table is now OCCUPIED
    const updatedTable = await database.diningTable.findUnique({ where: { id: tableId } });
    expect(updatedTable?.status).toBe('OCCUPIED');
  });

  // TEST-001 (Invariant 1): Cross-store table assignment prevention
  it('blocks cross-store table assignment when creating or updating reservations (SEC-001)', async () => {
    const auth = { authorization: `Bearer ${token}` };
    const twoDaysLaterStr = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);

    // 1. Attempt to create reservation in Store 1 with table from Store 2 -> 403 Forbidden
    const crossStoreCreate = await request(app.getHttpServer())
      .post('/api/v1/reservations')
      .set(auth)
      .send({
        storeId,
        tableId: tableStore2Id,
        customerName: 'Hacker Table',
        customerPhone: '0901234567',
        guestCount: 2,
        reservationTime: `${twoDaysLaterStr}T12:00:00.000Z`,
      })
      .expect(403);

    expect(crossStoreCreate.body.message).toContain('không thuộc chi nhánh này');

    // 2. Create valid reservation in Store 1 without table
    const validRes = await request(app.getHttpServer())
      .post('/api/v1/reservations')
      .set(auth)
      .send({
        storeId,
        customerName: 'Legitimate Guest',
        customerPhone: '0907654321',
        guestCount: 2,
        reservationTime: `${twoDaysLaterStr}T14:00:00.000Z`,
      })
      .expect(201);

    // 3. Attempt to re-assign reservation to Store 2's table -> 403 Forbidden
    const crossStoreUpdate = await request(app.getHttpServer())
      .patch(`/api/v1/reservations/${validRes.body.id}/status`)
      .set(auth)
      .send({
        status: 'CONFIRMED',
        tableId: tableStore2Id,
      })
      .expect(403);

    expect(crossStoreUpdate.body.message).toContain('không thuộc chi nhánh này');
  });

  // TEST-001 (Invariant 2): Concurrent overlapping booking race conditions
  it('serializes concurrent reservations and blocks overbooking on capacity limits (RUN-001)', async () => {
    const auth = { authorization: `Bearer ${token}` };
    const targetDate = new Date(Date.now() + 3 * 86400000);
    const dateStr = targetDate.toISOString().slice(0, 10);
    const timeSlot1 = `${dateStr}T19:00:00.000Z`;
    const timeSlotOverlap = `${dateStr}T19:30:00.000Z`;

    // Concurrently attempt two reservations that occupy full capacity of Table B-01
    const [res1, res2] = await Promise.all([
      request(app.getHttpServer()).post('/api/v1/reservations').set(auth).send({
        storeId,
        tableId,
        customerName: 'Concurrent Guest 1',
        customerPhone: '0911111111',
        guestCount: 4,
        reservationTime: timeSlot1,
        durationMinutes: 90,
      }),
      request(app.getHttpServer()).post('/api/v1/reservations').set(auth).send({
        storeId,
        tableId,
        customerName: 'Concurrent Guest 2',
        customerPhone: '0922222222',
        guestCount: 4,
        reservationTime: timeSlotOverlap,
        durationMinutes: 90,
      }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    // Exactly one reservation must succeed (201) and one must be rejected (409 Conflict)
    expect(statuses).toEqual([201, 409]);

    const conflictRes = res1.status === 409 ? res1 : res2;
    expect(conflictRes.body.message).toContain('đã có lịch đặt vào khung giờ này');
  });

  // TEST-001 (Invariant 3): QR self-order idempotency validation & replay
  it('enforces mandatory Idempotency-Key validation and deduplication on table self-order (RUN-003)', async () => {
    // 1. Missing Idempotency-Key -> 400 Bad Request
    const missingKeyRes = await request(app.getHttpServer())
      .post(`/api/v1/ordering/table/${qrToken}`)
      .send({
        items: [{ variantId, quantity: 1, optionIds: [] }],
      })
      .expect(400);

    expect(missingKeyRes.body.message).toContain('Idempotency-Key là bắt buộc');

    // 2. Short Idempotency-Key (< 8 chars) -> 400 Bad Request
    const shortKeyRes = await request(app.getHttpServer())
      .post(`/api/v1/ordering/table/${qrToken}`)
      .set({ 'idempotency-key': 'short' })
      .send({
        items: [{ variantId, quantity: 1, optionIds: [] }],
      })
      .expect(400);

    expect(shortKeyRes.body.message).toContain('từ 8 đến 128 ký tự');

    // 3. Valid Idempotency-Key -> 201 Created
    const stableKey = `e2e-idempotent-key-${Date.now()}`;
    const validOrderRes = await request(app.getHttpServer())
      .post(`/api/v1/ordering/table/${qrToken}`)
      .set({ 'idempotency-key': stableKey })
      .send({
        items: [{ variantId, quantity: 1, optionIds: [] }],
        idempotencyKey: stableKey,
      })
      .expect(201);

    expect(validOrderRes.body.success).toBe(true);
    const createdOrderId = validOrderRes.body.orderId;
    expect(createdOrderId).toBeDefined();

    // 4. Duplicate request with identical key -> 201 Created with exact same orderId (no duplicate order)
    const replayOrderRes = await request(app.getHttpServer())
      .post(`/api/v1/ordering/table/${qrToken}`)
      .set({ 'idempotency-key': stableKey })
      .send({
        items: [{ variantId, quantity: 1, optionIds: [] }],
        idempotencyKey: stableKey,
      })
      .expect(201);

    expect(replayOrderRes.body.orderId).toBe(createdOrderId);
  });
});
