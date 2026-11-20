import { randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaClient, UserRole } from '@prisma/client';
import argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('Inventory ledger flow (e2e)', () => {
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
    const keys = ['inventory.read', 'inventory.manage'];
    const permissions = await Promise.all(
      keys.map((key) =>
        database.permission.upsert({ where: { key }, update: {}, create: { key } }),
      ),
    );
    const role = await database.role.create({
      data: {
        key: `inventory-e2e-${suffix}`,
        name: 'Inventory e2e',
        permissions: { create: permissions.map((permission) => ({ permissionId: permission.id })) },
      },
    });
    roleId = role.id;
    const store = await database.store.create({ data: { name: `Inventory e2e ${suffix}` } });
    storeId = store.id;
    const user = await database.user.create({
      data: {
        email: `inventory-e2e-${suffix}@example.test`,
        passwordHash: await argon2.hash('inventory-e2e-password'),
        role: UserRole.INVENTORY_CLERK,
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
        .send({ email: user.email, password: 'inventory-e2e-password' })
        .expect(201)
    ).body.accessToken as string;
  });

  afterAll(async () => {
    await app?.close();
    await database?.$transaction(async (tx) => {
      await tx.idempotencyRecord.deleteMany({ where: { storeId } });
      await tx.inventoryLedgerEntry.deleteMany({ where: { storeId } });
      await tx.stockCount.deleteMany({ where: { storeId } });
      await tx.inventoryWaste.deleteMany({ where: { storeId } });
      await tx.inventoryTransfer.deleteMany({ where: { storeId } });
      await tx.goodsReceiptLine.deleteMany({ where: { receipt: { storeId } } });
      await tx.stockLot.deleteMany({ where: { storeId } });
      await tx.goodsReceipt.deleteMany({ where: { storeId } });
      await tx.ingredient.deleteMany({ where: { storeId } });
      await tx.inventoryLocation.deleteMany({ where: { storeId } });
      await tx.supplier.deleteMany({ where: { storeId } });
    });
    await database?.store.deleteMany({ where: { id: storeId } });
    await database?.user.deleteMany({ where: { id: userId } });
    await database?.role.deleteMany({ where: { id: roleId } });
    await database?.$disconnect();
  });

  it('posts a receipt idempotently and preserves a reconciled balance through transfer, waste, and count', async () => {
    const auth = { authorization: `Bearer ${token}` };
    const supplier = await request(app.getHttpServer())
      .post('/api/v1/kho-nguyen-lieu/suppliers')
      .set(auth)
      .send({ storeId, name: 'Chicken supplier' })
      .expect(201);
    const storage = await request(app.getHttpServer())
      .post('/api/v1/kho-nguyen-lieu/locations')
      .set(auth)
      .send({ storeId, name: 'Dry storage', kind: 'STORAGE' })
      .expect(201);
    const prep = await request(app.getHttpServer())
      .post('/api/v1/kho-nguyen-lieu/locations')
      .set(auth)
      .send({ storeId, name: 'Prep bench', kind: 'PREP' })
      .expect(201);
    const ingredient = await request(app.getHttpServer())
      .post('/api/v1/kho-nguyen-lieu/ingredients')
      .set(auth)
      .send({ storeId, sku: 'CHK-THIGH', name: 'Chicken thigh', unit: 'GRAM' })
      .expect(201);
    const body = {
      storeId,
      supplierId: supplier.body.id,
      locationId: storage.body.id,
      reference: 'GR-001',
      lines: [
        { ingredientId: ingredient.body.id, quantity: 1000, unitCost: 90, lotCode: 'LOT-001' },
      ],
    };
    const first = await request(app.getHttpServer())
      .post('/api/v1/kho-nguyen-lieu/receipts')
      .set({ ...auth, 'idempotency-key': 'receipt-001' })
      .send(body)
      .expect(201);
    const replay = await request(app.getHttpServer())
      .post('/api/v1/kho-nguyen-lieu/receipts')
      .set({ ...auth, 'idempotency-key': 'receipt-001' })
      .send(body)
      .expect(201);
    expect(replay.body.id).toBe(first.body.id);
    const lotId = first.body.lines[0].lot.id as string;

    await request(app.getHttpServer())
      .post('/api/v1/kho-nguyen-lieu/transfers')
      .set(auth)
      .send({
        storeId,
        ingredientId: ingredient.body.id,
        lotId,
        fromLocationId: storage.body.id,
        toLocationId: prep.body.id,
        quantity: 200,
        note: 'Prep for lunch',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/kho-nguyen-lieu/wastes')
      .set(auth)
      .send({
        storeId,
        ingredientId: ingredient.body.id,
        lotId,
        locationId: prep.body.id,
        quantity: 50,
        reason: 'Damaged',
      })
      .expect(201);
    const count = await request(app.getHttpServer())
      .post('/api/v1/kho-nguyen-lieu/counts')
      .set(auth)
      .send({
        storeId,
        ingredientId: ingredient.body.id,
        lotId,
        locationId: prep.body.id,
        countedQuantity: 130,
        reason: 'End of prep count',
      })
      .expect(201);
    expect(count.body).toMatchObject({ expectedQuantity: 150, varianceQuantity: -20 });

    const stock = await request(app.getHttpServer())
      .get(`/api/v1/kho-nguyen-lieu/stock?storeId=${storeId}`)
      .set(auth)
      .expect(200);
    expect(stock.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          location: expect.objectContaining({ id: storage.body.id }),
          quantity: 800,
        }),
        expect.objectContaining({
          location: expect.objectContaining({ id: prep.body.id }),
          quantity: 130,
        }),
      ]),
    );
    const ledger = await request(app.getHttpServer())
      .get(`/api/v1/kho-nguyen-lieu/ledger?storeId=${storeId}`)
      .set(auth)
      .expect(200);
    expect(ledger.body.map((entry: { type: string }) => entry.type)).toEqual(
      expect.arrayContaining([
        'RECEIPT',
        'TRANSFER_OUT',
        'TRANSFER_IN',
        'WASTE',
        'COUNT_ADJUSTMENT',
      ]),
    );
  });
});
