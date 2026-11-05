import { randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  FulfillmentStatus,
  InventoryLedgerType,
  InventoryLocationKind,
  PrismaClient,
  UserRole,
} from '@prisma/client';
import argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('Recipe consumption at KDS preparation (e2e)', () => {
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
    const permissions = await Promise.all(
      ['fulfillment.read', 'fulfillment.manage', 'inventory.read'].map((key) =>
        database.permission.upsert({ where: { key }, update: {}, create: { key } }),
      ),
    );
    const role = await database.role.create({
      data: {
        key: `recipe-kds-e2e-${suffix}`,
        name: 'Recipe KDS e2e',
        permissions: { create: permissions.map((permission) => ({ permissionId: permission.id })) },
      },
    });
    roleId = role.id;
    const store = await database.store.create({ data: { name: `Recipe KDS e2e ${suffix}` } });
    storeId = store.id;
    const user = await database.user.create({
      data: {
        email: `recipe-kds-${suffix}@example.test`,
        passwordHash: await argon2.hash('recipe-kds-password'),
        role: UserRole.KITCHEN,
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
        .send({ email: user.email, password: 'recipe-kds-password' })
        .expect(201)
    ).body.accessToken as string;
  });

  afterAll(async () => {
    await app?.close();
    await database?.$transaction(async (tx) => {
      await tx.inventoryLedgerEntry.deleteMany({ where: { storeId } });
      await tx.fulfillmentTicketEvent.deleteMany({ where: { ticket: { storeId } } });
      await tx.fulfillmentTicketItem.deleteMany({ where: { ticket: { storeId } } });
      await tx.fulfillmentTicket.deleteMany({ where: { storeId } });
      await tx.orderItem.deleteMany({ where: { order: { storeId } } });
      await tx.order.deleteMany({ where: { storeId } });
      await tx.recipeLine.deleteMany({ where: { recipe: { storeId } } });
      await tx.recipeRevision.deleteMany({ where: { storeId } });
      await tx.goodsReceiptLine.deleteMany({ where: { receipt: { storeId } } });
      await tx.stockLot.deleteMany({ where: { storeId } });
      await tx.goodsReceipt.deleteMany({ where: { storeId } });
      await tx.ingredient.deleteMany({ where: { storeId } });
      await tx.inventoryLocation.deleteMany({ where: { storeId } });
      await tx.product.deleteMany({ where: { storeId } });
      await tx.category.deleteMany({ where: { storeId } });
      await tx.store.deleteMany({ where: { id: storeId } });
    });
    await database?.user.deleteMany({ where: { id: userId } });
    await database?.role.deleteMany({ where: { id: roleId } });
    await database?.$disconnect();
  });

  it('consumes prep stock once by FEFO and exposes the resulting operational alerts', async () => {
    const category = await database.category.create({
      data: { storeId, name: `Recipe category ${randomUUID()}` },
    });
    const product = await database.product.create({
      data: {
        storeId,
        categoryId: category.id,
        name: 'Recipe chicken',
        inventoryMode: 'TRACKED',
        variants: { create: { name: 'Regular' } },
      },
      include: { variants: true },
    });
    const ingredient = await database.ingredient.create({
      data: { storeId, sku: 'CHICKEN-G', name: 'Chicken', unit: 'GRAM', lowStockQuantity: 200 },
    });
    const prep = await database.inventoryLocation.create({
      data: { storeId, name: 'Prep kitchen', kind: InventoryLocationKind.PREP },
    });
    const receivedAt = new Date();
    const receipt = await database.goodsReceipt.create({
      data: {
        storeId,
        locationId: prep.id,
        receivedById: userId,
        receivedAt,
        lines: {
          create: {
            ingredientId: ingredient.id,
            quantity: 250,
            unitCost: 100,
            lotCode: 'KDS-FEFO-01',
            expiresAt: new Date(Date.now() + 86_400_000),
            lot: {
              create: {
                storeId,
                ingredientId: ingredient.id,
                code: 'KDS-FEFO-01',
                receivedAt,
                expiresAt: new Date(Date.now() + 86_400_000),
                unitCost: 100,
              },
            },
          },
        },
      },
      include: { lines: { include: { lot: true } } },
    });
    const lot = receipt.lines[0].lot!;
    await database.inventoryLedgerEntry.create({
      data: {
        storeId,
        ingredientId: ingredient.id,
        locationId: prep.id,
        lotId: lot.id,
        type: InventoryLedgerType.RECEIPT,
        quantity: 250,
        sourceType: 'GOODS_RECEIPT',
        sourceId: receipt.id,
        actorId: userId,
      },
    });
    await database.recipeRevision.create({
      data: {
        storeId,
        productId: product.id,
        version: 1,
        createdById: userId,
        lines: { create: { ingredientId: ingredient.id, quantity: 60 } },
      },
    });
    const order = await database.order.create({
      data: {
        storeId,
        createdById: userId,
        totalAmount: 118000,
        items: {
          create: {
            productId: product.id,
            variantId: product.variants[0].id,
            productName: product.name,
            variantName: 'Regular',
            unitPrice: 59000,
            quantity: 2,
            optionsSnapshot: [],
            lineTotal: 118000,
          },
        },
      },
      include: { items: true },
    });
    const ticket = await database.fulfillmentTicket.create({
      data: {
        storeId,
        orderId: order.id,
        events: { create: { toStatus: FulfillmentStatus.QUEUED, actorId: userId } },
        items: {
          create: {
            orderItemId: order.items[0].id,
            productName: product.name,
            variantName: 'Regular',
            quantity: 2,
            optionsSnapshot: [],
            inventoryMode: 'TRACKED',
            recipeSnapshot: {
              version: 1,
              productName: product.name,
              lines: [
                { ingredientId: ingredient.id, ingredientName: ingredient.name, quantity: 60 },
              ],
            },
          },
        },
      },
    });
    const auth = { authorization: `Bearer ${token}` };

    await request(app.getHttpServer())
      .post(`/api/v1/fulfillment/tickets/${ticket.id}/transition`)
      .set(auth)
      .send({ status: 'PREPARING' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/fulfillment/tickets/${ticket.id}/transition`)
      .set(auth)
      .send({ status: 'PREPARING' })
      .expect(201);

    const consumption = await database.inventoryLedgerEntry.findMany({
      where: {
        sourceType: 'FULFILLMENT_TICKET',
        sourceId: ticket.id,
        type: InventoryLedgerType.CONSUMPTION,
      },
    });
    expect(consumption).toHaveLength(1);
    expect(consumption[0]).toMatchObject({
      ingredientId: ingredient.id,
      locationId: prep.id,
      lotId: lot.id,
      quantity: -120,
    });
    const stock = await request(app.getHttpServer())
      .get(`/api/v1/inventory/stock?storeId=${storeId}`)
      .set(auth)
      .expect(200);
    expect(stock.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ingredient: expect.objectContaining({ id: ingredient.id }),
          location: expect.objectContaining({ id: prep.id }),
          lot: expect.objectContaining({ id: lot.id }),
          quantity: 130,
        }),
      ]),
    );
    const alerts = await request(app.getHttpServer())
      .get(`/api/v1/inventory/alerts?storeId=${storeId}`)
      .set(auth)
      .expect(200);
    expect(alerts.body.lowStock).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ingredient: expect.objectContaining({ id: ingredient.id }),
          quantity: 130,
          threshold: 200,
          shortfall: 70,
        }),
      ]),
    );
    expect(alerts.body.nearExpiry).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lot: expect.objectContaining({ id: lot.id }),
          quantity: 130,
          daysUntilExpiry: expect.any(Number),
        }),
      ]),
    );
    expect(alerts.body.todayReceived).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ lot: expect.objectContaining({ id: lot.id }), quantity: 130 }),
      ]),
    );
  });
});
