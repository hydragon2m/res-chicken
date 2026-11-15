import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IdempotencyScope, InventoryLedgerType, Prisma } from '@prisma/client';
import { CatalogService } from '../catalog/catalog.service.js';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../database/prisma.service.js';
import type { AuthenticatedUser } from '../identity/types/authenticated-user.js';
import type { CreateCountDto } from './dto/create-count.dto.js';
import type { CreateIngredientDto } from './dto/create-ingredient.dto.js';
import type { CreateLocationDto } from './dto/create-location.dto.js';
import type { CreateReceiptDto } from './dto/create-receipt.dto.js';
import type { CreateRecipeDto } from './dto/create-recipe.dto.js';
import type { CreateSupplierDto } from './dto/create-supplier.dto.js';
import type { CreateTransferDto } from './dto/create-transfer.dto.js';
import type { CreateWasteDto } from './dto/create-waste.dto.js';

type DbClient = Prisma.TransactionClient | PrismaService;
const receiptInclude = {
  supplier: true,
  location: true,
  lines: { include: { ingredient: true, lot: true } },
} satisfies Prisma.GoodsReceiptInclude;

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly audit: AuditService,
  ) {}

  async listSuppliers(actor: AuthenticatedUser, storeId: string) {
    this.assertStore(actor, storeId);
    return this.prisma.supplier.findMany({ where: { storeId }, orderBy: { name: 'asc' } });
  }

  async createSupplier(actor: AuthenticatedUser, dto: CreateSupplierDto) {
    this.assertStore(actor, dto.storeId);
    const name = this.text(dto.name, 'Supplier name');
    const note = dto.note?.trim() || dto.email?.trim() || undefined;
    const created = await this.write(() =>
      this.prisma.supplier.upsert({
        where: { storeId_name: { storeId: dto.storeId, name } },
        update: {
          phone: dto.phone ?? undefined,
          note,
          isActive: true,
        },
        create: {
          storeId: dto.storeId,
          name,
          phone: dto.phone ?? undefined,
          note,
        },
      }),
    );
    if (actor.isPlatformAdmin || actor.role === 'ADMIN') {
      const otherStores = await this.prisma.store.findMany({
        where: { id: { not: dto.storeId } },
        select: { id: true },
      });
      for (const s of otherStores) {
        await this.prisma.supplier
          .upsert({
            where: { storeId_name: { storeId: s.id, name } },
            update: { phone: dto.phone ?? undefined, note, isActive: true },
            create: { storeId: s.id, name, phone: dto.phone ?? undefined, note },
          })
          .catch(() => undefined);
      }
    }
    return created;
  }

  async listLocations(actor: AuthenticatedUser, storeId: string) {
    this.assertStore(actor, storeId);
    return this.prisma.inventoryLocation.findMany({ where: { storeId }, orderBy: { name: 'asc' } });
  }

  async createLocation(actor: AuthenticatedUser, dto: CreateLocationDto) {
    this.assertStore(actor, dto.storeId);
    const name = this.text(dto.name, 'Location name');
    return this.write(() =>
      this.prisma.inventoryLocation.upsert({
        where: { storeId_name: { storeId: dto.storeId, name } },
        update: { kind: dto.kind, isActive: true },
        create: { ...dto, name },
      }),
    );
  }

  async listIngredients(actor: AuthenticatedUser, storeId: string) {
    this.assertStore(actor, storeId);
    return this.prisma.ingredient.findMany({ where: { storeId }, orderBy: { name: 'asc' } });
  }

  async createIngredient(actor: AuthenticatedUser, dto: CreateIngredientDto) {
    this.assertStore(actor, dto.storeId);
    const name = this.text(dto.name, 'Ingredient name');
    const existingByName = await this.prisma.ingredient.findUnique({
      where: { storeId_name: { storeId: dto.storeId, name } },
    });
    let created: Awaited<ReturnType<typeof this.prisma.ingredient.create>>;
    if (existingByName) {
      created = await this.prisma.ingredient.update({
        where: { id: existingByName.id },
        data: {
          unit: dto.unit,
          lowStockQuantity: dto.lowStockQuantity ?? existingByName.lowStockQuantity,
          isActive: true,
        },
      });
    } else {
      const rawSku = dto.sku?.trim() || this.autoSku(name);
      let finalSku = rawSku;
      const existingBySku = await this.prisma.ingredient.findUnique({
        where: { storeId_sku: { storeId: dto.storeId, sku: finalSku } },
      });
      if (existingBySku) {
        finalSku = `${rawSku.slice(0, 68)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      }
      created = await this.write(() =>
        this.prisma.ingredient.create({
          data: {
            ...dto,
            sku: finalSku,
            name,
          },
        }),
      );
    }
    if (actor.isPlatformAdmin || actor.role === 'ADMIN') {
      const otherStores = await this.prisma.store.findMany({
        where: { id: { not: dto.storeId } },
        select: { id: true },
      });
      for (const s of otherStores) {
        await this.prisma.ingredient
          .upsert({
            where: { storeId_name: { storeId: s.id, name: created.name } },
            update: {
              unit: created.unit,
              lowStockQuantity: created.lowStockQuantity,
              isActive: true,
            },
            create: {
              storeId: s.id,
              name: created.name,
              sku: created.sku,
              unit: created.unit,
              lowStockQuantity: created.lowStockQuantity,
              isActive: true,
            },
          })
          .catch(() => undefined);
      }
    }
    return created;
  }

  async listReceipts(actor: AuthenticatedUser, storeId: string) {
    this.assertStore(actor, storeId);
    return this.prisma.goodsReceipt.findMany({
      where: { storeId },
      include: receiptInclude,
      orderBy: { receivedAt: 'desc' },
      take: 100,
    });
  }

  async receive(actor: AuthenticatedUser, key: string | undefined, dto: CreateReceiptDto) {
    this.assertStore(actor, dto.storeId);
    this.idempotencyKey(key);
    const replay = await this.prisma.idempotencyRecord.findUnique({
      where: {
        storeId_scope_key: { storeId: dto.storeId, scope: IdempotencyScope.RECEIVE_INVENTORY, key },
      },
    });
    if (replay?.receiptId) return this.receipt(actor, replay.receiptId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockStore(tx, dto.storeId);
        const replayAfterLock = await tx.idempotencyRecord.findUnique({
          where: {
            storeId_scope_key: {
              storeId: dto.storeId,
              scope: IdempotencyScope.RECEIVE_INVENTORY,
              key,
            },
          },
        });
        if (replayAfterLock?.receiptId)
          return tx.goodsReceipt.findUniqueOrThrow({
            where: { id: replayAfterLock.receiptId },
            include: receiptInclude,
          });
        await this.location(tx, dto.storeId, dto.locationId);
        if (dto.supplierId) await this.supplier(tx, dto.storeId, dto.supplierId);
        const ingredientIds = [...new Set(dto.lines.map((line) => line.ingredientId))];
        const ingredients = await tx.ingredient.findMany({
          where: { id: { in: ingredientIds }, storeId: dto.storeId, isActive: true },
          select: { id: true },
        });
        if (ingredients.length !== ingredientIds.length)
          throw new BadRequestException('Receipt contains an inactive or out-of-scope ingredient.');
        const receivedAt = dto.receivedAt ? this.date(dto.receivedAt) : new Date();
        const dateTag = receivedAt.toISOString().slice(2, 10).replace(/-/g, '');
        const candidateCodes = dto.lines.map((line, idx) => {
          const raw = line.lotCode?.trim();
          return raw || `LOT-${dateTag}-${String(idx + 1).padStart(2, '0')}`;
        });
        const existingLotRecords = await tx.stockLot.findMany({
          where: { storeId: dto.storeId, code: { in: candidateCodes } },
          select: { code: true },
        });
        const usedCodes = new Set(existingLotRecords.map((r) => r.code));
        const lotCodes = candidateCodes.map((baseCode) => {
          let code = baseCode;
          while (usedCodes.has(code)) {
            const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
            code = `${baseCode.slice(0, 72)}-${suffix}`;
          }
          usedCodes.add(code);
          return code;
        });
        const receipt = await tx.goodsReceipt.create({
          data: {
            storeId: dto.storeId,
            supplierId: dto.supplierId,
            locationId: dto.locationId,
            reference: dto.reference?.trim() || null,
            receivedAt,
            receivedById: actor.id,
            note: dto.note?.trim() || null,
            lines: {
              create: dto.lines.map((line, index) => ({
                ingredientId: line.ingredientId,
                quantity: line.quantity,
                unitCost: line.unitCost,
                lotCode: lotCodes[index],
                expiresAt: line.expiresAt ? this.date(line.expiresAt) : null,
                lot: {
                  create: {
                    storeId: dto.storeId,
                    ingredientId: line.ingredientId,
                    supplierId: dto.supplierId,
                    code: lotCodes[index],
                    receivedAt,
                    expiresAt: line.expiresAt ? this.date(line.expiresAt) : null,
                    unitCost: line.unitCost,
                  },
                },
              })),
            },
          },
          include: receiptInclude,
        });
        await tx.inventoryLedgerEntry.createMany({
          data: receipt.lines.map((line) => ({
            storeId: dto.storeId,
            ingredientId: line.ingredientId,
            locationId: dto.locationId,
            lotId: line.lot!.id,
            type: InventoryLedgerType.RECEIPT,
            quantity: line.quantity,
            sourceType: 'GOODS_RECEIPT',
            sourceId: receipt.id,
            note: receipt.note,
            occurredAt: receivedAt,
            actorId: actor.id,
          })),
        });
        await tx.idempotencyRecord.create({
          data: {
            storeId: dto.storeId,
            scope: IdempotencyScope.RECEIVE_INVENTORY,
            key,
            receiptId: receipt.id,
          },
        });
        return receipt;
      });
    } catch (error) {
      if (this.unique(error)) {
        const record = await this.prisma.idempotencyRecord.findUnique({
          where: {
            storeId_scope_key: {
              storeId: dto.storeId,
              scope: IdempotencyScope.RECEIVE_INVENTORY,
              key,
            },
          },
        });
        if (record?.receiptId) return this.receipt(actor, record.receiptId);
      }
      throw error;
    }
  }

  async transfer(actor: AuthenticatedUser, dto: CreateTransferDto) {
    this.assertStore(actor, dto.storeId);
    if (dto.fromLocationId === dto.toLocationId)
      throw new BadRequestException('Transfer locations must be different.');
    return this.prisma.$transaction(async (tx) => {
      await this.lockStore(tx, dto.storeId);
      await this.ingredient(tx, dto.storeId, dto.ingredientId);
      await this.location(tx, dto.storeId, dto.fromLocationId);
      await this.location(tx, dto.storeId, dto.toLocationId);
      if (dto.lotId) await this.lot(tx, dto.storeId, dto.ingredientId, dto.lotId);
      const allocations = await this.allocateStockAtLocation(
        tx,
        dto.storeId,
        dto.ingredientId,
        dto.fromLocationId,
        dto.lotId,
        dto.quantity,
      );
      const transfer = await tx.inventoryTransfer.create({
        data: {
          ...dto,
          lotId: dto.lotId ?? allocations[0]?.lotId,
          note: dto.note?.trim() || null,
          transferredById: actor.id,
        },
      });
      await tx.inventoryLedgerEntry.createMany({
        data: allocations.flatMap((alloc) => [
          this.ledgerEntry(
            dto.storeId,
            dto.ingredientId,
            dto.fromLocationId,
            alloc.lotId,
            InventoryLedgerType.TRANSFER_OUT,
            -alloc.quantity,
            'INVENTORY_TRANSFER',
            transfer.id,
            dto.note,
            actor.id,
          ),
          this.ledgerEntry(
            dto.storeId,
            dto.ingredientId,
            dto.toLocationId,
            alloc.lotId,
            InventoryLedgerType.TRANSFER_IN,
            alloc.quantity,
            'INVENTORY_TRANSFER',
            transfer.id,
            dto.note,
            actor.id,
          ),
        ]),
      });
      return transfer;
    });
  }

  async count(actor: AuthenticatedUser, dto: CreateCountDto) {
    this.assertStore(actor, dto.storeId);
    return this.prisma.$transaction(async (tx) => {
      await this.lockStore(tx, dto.storeId);
      await this.ingredient(tx, dto.storeId, dto.ingredientId);
      await this.location(tx, dto.storeId, dto.locationId);
      if (dto.lotId) await this.lot(tx, dto.storeId, dto.ingredientId, dto.lotId);
      const expectedQuantity = await this.balance(
        tx,
        dto.storeId,
        dto.ingredientId,
        dto.locationId,
        dto.lotId,
      );
      const varianceQuantity = dto.countedQuantity - expectedQuantity;
      let targetLotId = dto.lotId;
      if (!targetLotId && varianceQuantity !== 0) {
        const latestLot = await tx.stockLot.findFirst({
          where: { storeId: dto.storeId, ingredientId: dto.ingredientId },
          orderBy: { receivedAt: 'desc' },
          select: { id: true },
        });
        targetLotId = latestLot?.id;
      }
      const count = await tx.stockCount.create({
        data: {
          storeId: dto.storeId,
          ingredientId: dto.ingredientId,
          locationId: dto.locationId,
          lotId: targetLotId,
          expectedQuantity,
          countedQuantity: dto.countedQuantity,
          varianceQuantity,
          reason: this.text(dto.reason, 'Count reason'),
          countedById: actor.id,
        },
      });
      if (varianceQuantity)
        await tx.inventoryLedgerEntry.create({
          data: this.ledgerEntry(
            dto.storeId,
            dto.ingredientId,
            dto.locationId,
            targetLotId,
            InventoryLedgerType.COUNT_ADJUSTMENT,
            varianceQuantity,
            'STOCK_COUNT',
            count.id,
            dto.reason,
            actor.id,
          ),
        });
      return count;
    });
  }

  async waste(actor: AuthenticatedUser, dto: CreateWasteDto) {
    this.assertStore(actor, dto.storeId);
    return this.prisma.$transaction(async (tx) => {
      await this.lockStore(tx, dto.storeId);
      await this.ingredient(tx, dto.storeId, dto.ingredientId);
      await this.location(tx, dto.storeId, dto.locationId);
      if (dto.lotId) await this.lot(tx, dto.storeId, dto.ingredientId, dto.lotId);
      const allocations = await this.allocateStockAtLocation(
        tx,
        dto.storeId,
        dto.ingredientId,
        dto.locationId,
        dto.lotId,
        dto.quantity,
      );
      const waste = await tx.inventoryWaste.create({
        data: {
          ...dto,
          lotId: dto.lotId ?? allocations[0]?.lotId,
          reason: this.text(dto.reason, 'Waste reason'),
          wastedById: actor.id,
        },
      });
      await tx.inventoryLedgerEntry.createMany({
        data: allocations.map((alloc) =>
          this.ledgerEntry(
            dto.storeId,
            dto.ingredientId,
            dto.locationId,
            alloc.lotId,
            InventoryLedgerType.WASTE,
            -alloc.quantity,
            'INVENTORY_WASTE',
            waste.id,
            dto.reason,
            actor.id,
          ),
        ),
      });
      await this.audit.write(tx, {
        storeId: dto.storeId,
        actorId: actor.id,
        action: 'INVENTORY_WASTE_CREATED',
        targetType: 'INVENTORY_WASTE',
        targetId: waste.id,
        metadata: {
          ingredientId: dto.ingredientId,
          locationId: dto.locationId,
          lotId: waste.lotId ?? null,
          quantity: dto.quantity,
          reason: waste.reason,
        },
      });
      return waste;
    });
  }

  async createRecipe(actor: AuthenticatedUser, dto: CreateRecipeDto) {
    this.assertStore(actor, dto.storeId);
    await this.catalog.assertProductInStore(actor, dto.productId);
    if (new Set(dto.lines.map((line) => line.ingredientId)).size !== dto.lines.length)
      throw new BadRequestException('Each ingredient may appear only once in a recipe.');
    const created = await this.prisma.$transaction(async (tx) => {
      await this.lockStore(tx, dto.storeId);
      const ingredients = await tx.ingredient.count({
        where: {
          id: { in: dto.lines.map((line) => line.ingredientId) },
          storeId: dto.storeId,
          isActive: true,
        },
      });
      if (ingredients !== dto.lines.length)
        throw new BadRequestException('Recipe contains an inactive or out-of-scope ingredient.');
      const latest = await tx.recipeRevision.aggregate({
        where: { productId: dto.productId },
        _max: { version: true },
      });
      await tx.recipeRevision.updateMany({
        where: { productId: dto.productId, isActive: true },
        data: { isActive: false },
      });
      await tx.product.update({
        where: { id: dto.productId },
        data: { inventoryMode: 'TRACKED' },
      });
      return tx.recipeRevision.create({
        data: {
          storeId: dto.storeId,
          productId: dto.productId,
          version: (latest._max.version ?? 0) + 1,
          createdById: actor.id,
          lines: { create: dto.lines },
        },
        include: { lines: { include: { ingredient: true } }, product: true },
      });
    });

    if (actor.isPlatformAdmin || actor.role === 'ADMIN') {
      const otherStores = await this.prisma.store.findMany({
        where: { id: { not: dto.storeId } },
        select: { id: true },
      });
      for (const s of otherStores) {
        try {
          const targetProd = await this.prisma.product.findFirst({
            where: { storeId: s.id, name: created.product.name },
          });
          if (!targetProd) continue;
          const mappedLines: Array<{ ingredientId: string; quantity: number }> = [];
          for (const line of created.lines) {
            const targetIng = await this.prisma.ingredient.upsert({
              where: { storeId_name: { storeId: s.id, name: line.ingredient.name } },
              update: {},
              create: {
                storeId: s.id,
                name: line.ingredient.name,
                sku: line.ingredient.sku,
                unit: line.ingredient.unit,
                lowStockQuantity: line.ingredient.lowStockQuantity,
                isActive: true,
              },
            });
            mappedLines.push({ ingredientId: targetIng.id, quantity: line.quantity });
          }
          const latestTarget = await this.prisma.recipeRevision.aggregate({
            where: { productId: targetProd.id },
            _max: { version: true },
          });
          await this.prisma.recipeRevision.updateMany({
            where: { productId: targetProd.id, isActive: true },
            data: { isActive: false },
          });
          await this.prisma.product.update({
            where: { id: targetProd.id },
            data: { inventoryMode: 'TRACKED' },
          });
          await this.prisma.recipeRevision.create({
            data: {
              storeId: s.id,
              productId: targetProd.id,
              version: (latestTarget._max.version ?? 0) + 1,
              createdById: actor.id,
              lines: { create: mappedLines },
            },
          });
        } catch {
          // Ignore individual store conflict
        }
      }
    }
    return created;
  }

  async listRecipes(actor: AuthenticatedUser, storeId: string) {
    this.assertStore(actor, storeId);
    return this.prisma.recipeRevision.findMany({
      where: { storeId },
      include: { product: true, lines: { include: { ingredient: true } } },
      orderBy: [{ product: { name: 'asc' } }, { version: 'desc' }],
    });
  }

  async listRecipeProducts(actor: AuthenticatedUser, storeId: string) {
    this.assertStore(actor, storeId);
    return this.prisma.product.findMany({
      where: { storeId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Validates BOM recipes and available non-expired stock for an order before creation.
   */
  async assertOrderStockAvailable(
    tx: DbClient,
    storeId: string,
    items: Array<{
      productId: string;
      productName: string;
      quantity: number;
      inventoryMode: string;
    }>,
  ) {
    const productIds = [...new Set(items.map((item) => item.productId))];
    const activeRecipes = await tx.recipeRevision.findMany({
      where: { storeId, productId: { in: productIds }, isActive: true },
      include: { lines: { include: { ingredient: true } } },
    });
    const recipeByProductId = new Map(activeRecipes.map((r) => [r.productId, r]));

    const requiredByIngredient = new Map<
      string,
      { ingredientId: string; name: string; unit: string; quantity: number }
    >();

    for (const item of items) {
      const recipe = recipeByProductId.get(item.productId);
      if (item.inventoryMode === 'TRACKED' && !recipe) {
        throw new BadRequestException(
          `Món "${item.productName}" đang bật kiểm soát tồn kho nhưng chưa có công thức định lượng (BOM).`,
        );
      }
      if (!recipe) continue;
      for (const line of recipe.lines) {
        if (line.quantity <= 0) continue;
        const needed = line.quantity * item.quantity;
        const current = requiredByIngredient.get(line.ingredientId);
        if (current) {
          current.quantity += needed;
        } else {
          requiredByIngredient.set(line.ingredientId, {
            ingredientId: line.ingredientId,
            name: line.ingredient.name,
            unit: line.ingredient.unit,
            quantity: needed,
          });
        }
      }
    }

    if (requiredByIngredient.size === 0) return;

    const activeLocations = await tx.inventoryLocation.findMany({
      where: { storeId, isActive: true },
      select: { id: true },
    });
    if (!activeLocations.length) {
      throw new ConflictException(
        'Chi nhánh chưa có vị trí kho hoạt động để kiểm tra và xuất nguyên liệu.',
      );
    }

    const groups = await tx.inventoryLedgerEntry.groupBy({
      by: ['ingredientId', 'locationId', 'lotId'],
      where: {
        storeId,
        ingredientId: { in: [...requiredByIngredient.keys()] },
        locationId: { in: activeLocations.map((l) => l.id) },
      },
      _sum: { quantity: true },
    });

    const nonZero = groups.filter((g) => (g._sum.quantity ?? 0) > 0);
    const lotIds = nonZero.flatMap((g) => (g.lotId ? [g.lotId] : []));
    const lots = lotIds.length
      ? await tx.stockLot.findMany({
          where: { id: { in: lotIds } },
          select: { id: true, expiresAt: true },
        })
      : [];
    const lotById = new Map(lots.map((l) => [l.id, l]));
    const now = new Date();

    const availableByIngredient = new Map<string, number>();
    for (const g of nonZero) {
      const lot = g.lotId ? lotById.get(g.lotId) : undefined;
      if (lot?.expiresAt && lot.expiresAt < now) continue;
      availableByIngredient.set(
        g.ingredientId,
        (availableByIngredient.get(g.ingredientId) ?? 0) + (g._sum.quantity ?? 0),
      );
    }

    for (const req of requiredByIngredient.values()) {
      const avail = availableByIngredient.get(req.ingredientId) ?? 0;
      if (avail < req.quantity) {
        throw new ConflictException(
          `Không đủ nguyên liệu tồn kho cho định lượng món: "${req.name}" cần ${req.quantity} ${req.unit}, nhưng tồn kho khả dụng chỉ còn ${avail} ${req.unit}.`,
        );
      }
    }
  }

  /**
   * Deducts recipe ingredients when an order is paid (or when a ticket enters PREPARING if not yet deducted).
   * Prep-area stock is prioritized first, falling back to storage locations in FEFO order.
   */
  async consumeForFulfillment(tx: DbClient, ticketId: string, actorId: string) {
    const ticket = await tx.fulfillmentTicket.findUnique({
      where: { id: ticketId },
      include: { items: true },
    });
    if (!ticket) throw new NotFoundException('Fulfillment ticket not found.');
    const consumed = await tx.inventoryLedgerEntry.count({
      where: {
        storeId: ticket.storeId,
        sourceType: 'FULFILLMENT_TICKET',
        sourceId: ticket.id,
        type: InventoryLedgerType.CONSUMPTION,
      },
    });
    if (consumed) return;

    await this.lockStore(tx as Prisma.TransactionClient, ticket.storeId);
    const trackedItems = ticket.items.filter(
      (item) => item.inventoryMode === 'TRACKED' || Boolean(item.recipeSnapshot),
    );
    const missingRecipe = trackedItems.find(
      (item) => item.inventoryMode === 'TRACKED' && !item.recipeSnapshot,
    );
    if (missingRecipe)
      throw new ConflictException(
        `Cannot start preparation: ${missingRecipe.productName} was sold as inventory-tracked without a recipe.`,
      );
    const requirements = trackedItems
      .flatMap((item) => {
        if (!item.recipeSnapshot) return [];
        const snapshot = item.recipeSnapshot as {
          version: number;
          productName: string;
          lines: Array<{ ingredientId: string; ingredientName: string; quantity: number }>;
        };
        return snapshot.lines.map((line) => ({
          ingredientId: line.ingredientId,
          ingredientName: line.ingredientName,
          quantity: line.quantity * item.quantity,
          note: `Ticket ${ticket.id} · ${snapshot.productName} · recipe v${snapshot.version}`,
        }));
      })
      .filter((line) => line.quantity > 0);
    if (!requirements.length) return;

    const activeLocations = await tx.inventoryLocation.findMany({
      where: { storeId: ticket.storeId, isActive: true },
      select: { id: true, name: true, kind: true },
    });
    if (!activeLocations.length)
      throw new ConflictException(
        'Cannot start preparation: no active prep inventory location is configured.',
      );
    const locationKindById = new Map(activeLocations.map((loc) => [loc.id, loc.kind]));
    const groups = await tx.inventoryLedgerEntry.groupBy({
      by: ['ingredientId', 'locationId', 'lotId'],
      where: {
        storeId: ticket.storeId,
        ingredientId: { in: [...new Set(requirements.map((line) => line.ingredientId))] },
        locationId: { in: activeLocations.map((location) => location.id) },
      },
      _sum: { quantity: true },
    });
    const available = groups
      .filter((group) => (group._sum.quantity ?? 0) > 0)
      .map((group) => ({ ...group, quantity: group._sum.quantity ?? 0 }));
    const lotIds = available.flatMap((group) => (group.lotId ? [group.lotId] : []));
    const lots = await tx.stockLot.findMany({
      where: { id: { in: lotIds } },
      select: { id: true, expiresAt: true, receivedAt: true },
    });
    const lotById = new Map(lots.map((lot) => [lot.id, lot]));
    const now = new Date();
    const entries: Prisma.InventoryLedgerEntryUncheckedCreateInput[] = [];

    for (const requirement of requirements) {
      let remaining = requirement.quantity;
      const candidates = available
        .filter((group) => group.ingredientId === requirement.ingredientId && group.quantity > 0)
        .filter(
          (group) =>
            !group.lotId ||
            !lotById.get(group.lotId)?.expiresAt ||
            lotById.get(group.lotId)!.expiresAt! >= now,
        )
        .sort((left, right) => {
          const leftIsPrep = locationKindById.get(left.locationId) === 'PREP' ? 0 : 1;
          const rightIsPrep = locationKindById.get(right.locationId) === 'PREP' ? 0 : 1;
          if (leftIsPrep !== rightIsPrep) return leftIsPrep - rightIsPrep;
          const leftLot = left.lotId ? lotById.get(left.lotId) : undefined;
          const rightLot = right.lotId ? lotById.get(right.lotId) : undefined;
          const leftExpiry = leftLot?.expiresAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
          const rightExpiry = rightLot?.expiresAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
          if (leftExpiry !== rightExpiry) return leftExpiry - rightExpiry;
          const leftReceived = leftLot?.receivedAt.getTime() ?? Number.MAX_SAFE_INTEGER;
          const rightReceived = rightLot?.receivedAt.getTime() ?? Number.MAX_SAFE_INTEGER;
          return leftReceived - rightReceived;
        });
      for (const candidate of candidates) {
        if (!remaining) break;
        const quantity = Math.min(remaining, candidate.quantity);
        candidate.quantity -= quantity;
        remaining -= quantity;
        entries.push(
          this.ledgerEntry(
            ticket.storeId,
            requirement.ingredientId,
            candidate.locationId,
            candidate.lotId ?? undefined,
            InventoryLedgerType.CONSUMPTION,
            -quantity,
            'FULFILLMENT_TICKET',
            ticket.id,
            requirement.note,
            actorId,
          ),
        );
      }
      if (remaining)
        throw new ConflictException(
          `Cannot start preparation: insufficient prepared stock for ${requirement.ingredientName}.`,
        );
    }
    await tx.inventoryLedgerEntry.createMany({ data: entries });
  }

  /**
   * Reverses BOM inventory consumption when a paid order is refunded before kitchen preparation.
   */
  async reverseConsumptionForRefund(
    tx: DbClient,
    ticketId: string,
    actorId: string,
    reason: string,
  ) {
    const consumedEntries = await tx.inventoryLedgerEntry.findMany({
      where: {
        sourceType: 'FULFILLMENT_TICKET',
        sourceId: ticketId,
        type: InventoryLedgerType.CONSUMPTION,
      },
    });
    if (!consumedEntries.length) return;
    const alreadyReversed = await tx.inventoryLedgerEntry.count({
      where: {
        sourceType: 'FULFILLMENT_TICKET_REFUND',
        sourceId: ticketId,
      },
    });
    if (alreadyReversed) return;

    await tx.inventoryLedgerEntry.createMany({
      data: consumedEntries.map((entry) =>
        this.ledgerEntry(
          entry.storeId,
          entry.ingredientId,
          entry.locationId,
          entry.lotId ?? undefined,
          InventoryLedgerType.COUNT_ADJUSTMENT,
          Math.abs(entry.quantity),
          'FULFILLMENT_TICKET_REFUND',
          ticketId,
          `Hoàn kho do hoàn tiền đơn: ${reason}`,
          actorId,
        ),
      ),
    });
  }

  async stock(actor: AuthenticatedUser, storeId: string, locationId?: string) {
    this.assertStore(actor, storeId);
    if (locationId) await this.location(this.prisma, storeId, locationId);
    const groups = await this.prisma.inventoryLedgerEntry.groupBy({
      by: ['ingredientId', 'locationId', 'lotId'],
      where: { storeId, ...(locationId ? { locationId } : {}) },
      _sum: { quantity: true },
    });
    const nonZero = groups.filter((group) => (group._sum.quantity ?? 0) !== 0);
    const ingredientIds = [...new Set(nonZero.map((group) => group.ingredientId))];
    const locationIds = [...new Set(nonZero.map((group) => group.locationId))];
    const lotIds = nonZero.flatMap((group) => (group.lotId ? [group.lotId] : []));
    const [ingredients, locations, lots] = await Promise.all([
      this.prisma.ingredient.findMany({ where: { id: { in: ingredientIds } } }),
      this.prisma.inventoryLocation.findMany({ where: { id: { in: locationIds } } }),
      this.prisma.stockLot.findMany({ where: { id: { in: lotIds } }, include: { supplier: true } }),
    ]);
    const ingredientById = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));
    const locationById = new Map(locations.map((location) => [location.id, location]));
    const lotById = new Map(lots.map((lot) => [lot.id, lot]));
    return nonZero.map((group) => ({
      ingredient: ingredientById.get(group.ingredientId),
      location: locationById.get(group.locationId),
      lot: group.lotId ? lotById.get(group.lotId) : null,
      quantity: group._sum.quantity ?? 0,
    }));
  }

  async alerts(actor: AuthenticatedUser, storeId: string, expiryDays = 7) {
    this.assertStore(actor, storeId);
    const store = await this.prisma.store.findUniqueOrThrow({
      where: { id: storeId },
      select: { timezone: true },
    });
    const groups = await this.prisma.inventoryLedgerEntry.groupBy({
      by: ['ingredientId', 'lotId'],
      where: { storeId },
      _sum: { quantity: true },
    });
    const totalByIngredient = new Map<string, number>();
    const totalByLot = new Map<string, number>();
    for (const group of groups) {
      const quantity = group._sum.quantity ?? 0;
      totalByIngredient.set(
        group.ingredientId,
        (totalByIngredient.get(group.ingredientId) ?? 0) + quantity,
      );
      if (group.lotId) totalByLot.set(group.lotId, (totalByLot.get(group.lotId) ?? 0) + quantity);
    }
    const ingredients = await this.prisma.ingredient.findMany({
      where: { storeId, isActive: true },
      orderBy: { name: 'asc' },
    });
    const lowStock = ingredients
      .filter(
        (ingredient) =>
          ingredient.lowStockQuantity !== null &&
          (totalByIngredient.get(ingredient.id) ?? 0) <= ingredient.lowStockQuantity,
      )
      .map((ingredient) => {
        const quantity = totalByIngredient.get(ingredient.id) ?? 0;
        const threshold = ingredient.lowStockQuantity!;
        return {
          ingredient,
          quantity,
          threshold,
          shortfall: Math.max(threshold - quantity, 0),
        };
      });

    const now = new Date();
    const horizon = new Date(now.getTime() + expiryDays * 86_400_000);
    const [expiringLots, todayRange] = await Promise.all([
      this.prisma.stockLot.findMany({
        where: { storeId, expiresAt: { not: null, lte: horizon } },
        include: { ingredient: true },
        orderBy: [{ expiresAt: 'asc' }, { receivedAt: 'asc' }],
      }),
      Promise.resolve(this.dayRange(store.timezone, now)),
    ]);
    const nearExpiry = expiringLots
      .map((lot) => {
        const expiresAt = lot.expiresAt!;
        return {
          lot,
          ingredient: lot.ingredient,
          quantity: totalByLot.get(lot.id) ?? 0,
          isExpired: expiresAt < now,
          daysUntilExpiry: Math.ceil((expiresAt.getTime() - now.getTime()) / 86_400_000),
        };
      })
      .filter((row) => row.quantity > 0);
    const todayLots = await this.prisma.stockLot.findMany({
      where: { storeId, receivedAt: { gte: todayRange.start, lt: todayRange.end } },
      include: { ingredient: true },
      orderBy: [{ receivedAt: 'asc' }, { code: 'asc' }],
    });
    const todayReceived = todayLots
      .map((lot) => ({ lot, ingredient: lot.ingredient, quantity: totalByLot.get(lot.id) ?? 0 }))
      .filter((row) => row.quantity > 0);
    return { lowStock, nearExpiry, todayReceived };
  }

  async ledger(actor: AuthenticatedUser, storeId: string) {
    this.assertStore(actor, storeId);
    return this.prisma.inventoryLedgerEntry.findMany({
      where: { storeId },
      include: { ingredient: true, location: true, lot: true },
      orderBy: { occurredAt: 'desc' },
      take: 200,
    });
  }

  private async receipt(actor: AuthenticatedUser, receiptId: string) {
    const receipt = await this.prisma.goodsReceipt.findUnique({
      where: { id: receiptId },
      include: receiptInclude,
    });
    if (!receipt) throw new NotFoundException('Goods receipt not found.');
    this.assertStore(actor, receipt.storeId);
    return receipt;
  }

  private async ingredient(tx: DbClient, storeId: string, ingredientId: string) {
    const ingredient = await tx.ingredient.findFirst({
      where: { id: ingredientId, storeId, isActive: true },
    });
    if (!ingredient) throw new NotFoundException('Ingredient not found for this store.');
    return ingredient;
  }

  private async location(tx: DbClient, storeId: string, locationId: string) {
    const location = await tx.inventoryLocation.findFirst({
      where: { id: locationId, storeId, isActive: true },
    });
    if (!location) throw new NotFoundException('Inventory location not found for this store.');
    return location;
  }

  private async supplier(tx: DbClient, storeId: string, supplierId: string) {
    const supplier = await tx.supplier.findFirst({
      where: { id: supplierId, storeId, isActive: true },
    });
    if (!supplier) throw new NotFoundException('Supplier not found for this store.');
    return supplier;
  }

  private async lot(tx: DbClient, storeId: string, ingredientId: string, lotId: string) {
    const lot = await tx.stockLot.findFirst({ where: { id: lotId, storeId, ingredientId } });
    if (!lot) throw new NotFoundException('Lot does not belong to this ingredient and store.');
    return lot;
  }

  private async balance(
    tx: DbClient,
    storeId: string,
    ingredientId: string,
    locationId: string,
    lotId?: string,
  ) {
    const result = await tx.inventoryLedgerEntry.aggregate({
      where: {
        storeId,
        ingredientId,
        locationId,
        ...(lotId ? { lotId } : {}),
      },
      _sum: { quantity: true },
    });
    return result._sum.quantity ?? 0;
  }

  private async allocateStockAtLocation(
    tx: DbClient,
    storeId: string,
    ingredientId: string,
    locationId: string,
    requestedLotId: string | undefined,
    quantity: number,
  ): Promise<Array<{ lotId: string | undefined; quantity: number }>> {
    if (requestedLotId) {
      const lotBalance = await this.balance(tx, storeId, ingredientId, locationId, requestedLotId);
      if (lotBalance >= quantity) {
        return [{ lotId: requestedLotId, quantity }];
      }
    }

    const groups = await tx.inventoryLedgerEntry.groupBy({
      by: ['lotId'],
      where: { storeId, ingredientId, locationId },
      _sum: { quantity: true },
    });
    const available = groups
      .map((g) => ({ lotId: g.lotId ?? undefined, quantity: g._sum.quantity ?? 0 }))
      .filter((g) => g.quantity > 0);
    const totalAvailable = available.reduce((sum, g) => sum + g.quantity, 0);
    if (totalAvailable < quantity) {
      throw new ConflictException(
        `Số lượng tồn kho tại vị trí đã chọn không đủ (cần ${quantity}, hiện còn ${totalAvailable}).`,
      );
    }

    const lotIds = available.flatMap((g) => (g.lotId ? [g.lotId] : []));
    const lots = await tx.stockLot.findMany({
      where: { id: { in: lotIds } },
      select: { id: true, expiresAt: true, receivedAt: true },
    });
    const lotById = new Map(lots.map((l) => [l.id, l]));

    available.sort((left, right) => {
      if (requestedLotId) {
        if (left.lotId === requestedLotId) return -1;
        if (right.lotId === requestedLotId) return 1;
      }
      const leftLot = left.lotId ? lotById.get(left.lotId) : undefined;
      const rightLot = right.lotId ? lotById.get(right.lotId) : undefined;
      const leftExpiry = leftLot?.expiresAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightExpiry = rightLot?.expiresAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      if (leftExpiry !== rightExpiry) return leftExpiry - rightExpiry;
      const leftReceived = leftLot?.receivedAt.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightReceived = rightLot?.receivedAt.getTime() ?? Number.MAX_SAFE_INTEGER;
      return leftReceived - rightReceived;
    });

    const result: Array<{ lotId: string | undefined; quantity: number }> = [];
    let remaining = quantity;
    for (const candidate of available) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, candidate.quantity);
      result.push({ lotId: candidate.lotId, quantity: take });
      remaining -= take;
    }
    return result;
  }

  private autoSku(name: string): string {
    const slug = name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/gi, 'd')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24);
    const suffix = Math.random().toString(36).slice(2, 5).toUpperCase();
    return `ING-${slug || 'NVL'}-${suffix}`;
  }

  private ledgerEntry(
    storeId: string,
    ingredientId: string,
    locationId: string,
    lotId: string | undefined,
    type: InventoryLedgerType,
    quantity: number,
    sourceType: string,
    sourceId: string,
    note: string | undefined,
    actorId: string,
  ): Prisma.InventoryLedgerEntryUncheckedCreateInput {
    return {
      storeId,
      ingredientId,
      locationId,
      lotId,
      type,
      quantity,
      sourceType,
      sourceId,
      note: note?.trim() || null,
      actorId,
    };
  }

  private assertStore(actor: AuthenticatedUser, storeId: string) {
    if (!actor.isPlatformAdmin && !actor.storeIds.includes(storeId))
      throw new ForbiddenException('Store access denied.');
  }
  private idempotencyKey(key: string | undefined): asserts key is string {
    if (!key?.trim() || key.length > 200)
      throw new BadRequestException('Idempotency-Key header is required.');
  }
  private text(value: string, label: string) {
    const trimmed = value.trim();
    if (!trimmed) throw new BadRequestException(`${label} is required.`);
    return trimmed;
  }
  private date(value: string) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) throw new BadRequestException('Invalid date.');
    return parsed;
  }
  private unique(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
  private async write<T>(operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      if (this.unique(error))
        throw new ConflictException(
          'A record with the same name, SKU, or lot code already exists.',
        );
      throw error;
    }
  }
  private async lockStore(tx: DbClient, storeId: string) {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`inventory:${storeId}`}))`,
    );
  }
  private dayRange(timezone: string, now: Date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const date = Object.fromEntries(
      parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
    );
    const current = `${date.year}-${date.month}-${date.day}`;
    const next = new Date(`${current}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const nextDate = next.toISOString().slice(0, 10);
    return {
      start: this.zonedMidnight(current, timezone),
      end: this.zonedMidnight(nextDate, timezone),
    };
  }
  private zonedMidnight(date: string, timezone: string) {
    const tentative = new Date(`${date}T00:00:00.000Z`);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(tentative);
    const value = Object.fromEntries(
      parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
    );
    const localAsUtc = Date.UTC(
      Number(value.year),
      Number(value.month) - 1,
      Number(value.day),
      Number(value.hour),
      Number(value.minute),
      Number(value.second),
    );
    return new Date(tentative.getTime() - (localAsUtc - tentative.getTime()));
  }
}
