import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryLedgerType,
  OrderStatus,
  Prisma,
  TableStatus,
  UserRole,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../database/prisma.service.js';
import type { AuthenticatedUser } from '../identity/types/authenticated-user.js';
import type {
  CreateCashRegisterDto,
  CreateStoreDto,
  InterStoreTransferDto,
  SyncStoreDataDto,
  UpdateStoreDto,
} from './dto/create-store.dto.js';

@Injectable()
export class StoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(actor: AuthenticatedUser) {
    this.assertPlatform(actor);
    return this.prisma.store.findMany({
      include: {
        cashRegisters: { orderBy: { code: 'asc' } },
        members: {
          include: {
            user: { select: { id: true, email: true, role: true, isActive: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async listPublic() {
    return this.prisma.store.findMany({
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
        openingTime: true,
        closingTime: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async chainOverview(actor: AuthenticatedUser, range = '30d') {
    this.assertPlatform(actor);

    const now = new Date();
    let currentStart: Date;
    const currentEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    if (range === 'today') {
      currentStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    } else if (range === '7d') {
      currentStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (range === 'month') {
      currentStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    } else {
      currentStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const [
      stores,
      paidOrders,
      unpaidOrders,
      tables,
      products,
      ingredients,
      recipes,
      ledgerEntries,
    ] = await Promise.all([
      this.prisma.store.findMany({
        include: {
          cashRegisters: { orderBy: { code: 'asc' } },
          members: {
            include: {
              user: { select: { id: true, email: true, role: true, isActive: true } },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.order.findMany({
        where: {
          status: OrderStatus.PAID,
          createdAt: { gte: currentStart, lte: currentEnd },
        },
        select: {
          id: true,
          storeId: true,
          totalAmount: true,
        },
      }),
      this.prisma.order.findMany({
        where: { status: OrderStatus.AWAITING_PAYMENT },
        select: { id: true, storeId: true, totalAmount: true },
      }),
      this.prisma.diningTable.findMany({
        where: { isActive: true },
        select: { id: true, storeId: true, status: true },
      }),
      this.prisma.product.findMany({
        where: { isActive: true },
        select: { id: true, storeId: true },
      }),
      this.prisma.ingredient.findMany({
        where: { isActive: true },
        select: { id: true, storeId: true, name: true, sku: true, unit: true, lowStockQuantity: true },
      }),
      this.prisma.recipeRevision.findMany({
        where: { isActive: true },
        select: { id: true, storeId: true },
      }),
      this.prisma.inventoryLedgerEntry.groupBy({
        by: ['storeId', 'ingredientId'],
        _sum: { quantity: true },
      }),
    ]);

    const stockMap = new Map<string, number>();
    for (const entry of ledgerEntries) {
      stockMap.set(`${entry.storeId}:${entry.ingredientId}`, entry._sum.quantity ?? 0);
    }

    const storeMetrics = stores.map((store) => {
      const storePaidOrders = paidOrders.filter((o) => o.storeId === store.id);
      const storeUnpaidOrders = unpaidOrders.filter((o) => o.storeId === store.id);
      const storeTables = tables.filter((t) => t.storeId === store.id);
      const storeProducts = products.filter((p) => p.storeId === store.id);
      const storeIngredients = ingredients.filter((i) => i.storeId === store.id);
      const storeRecipes = recipes.filter((r) => r.storeId === store.id);

      const revenue = storePaidOrders.reduce((sum, o) => sum + o.totalAmount, 0);
      const orderCount = storePaidOrders.length;
      const aov = orderCount > 0 ? Math.round(revenue / orderCount) : 0;
      const occupiedTablesCount = storeTables.filter((t) => t.status === TableStatus.OCCUPIED).length;
      const reservedTablesCount = storeTables.filter((t) => t.status === TableStatus.RESERVED).length;

      let lowStockCount = 0;
      const ingredientStocks = storeIngredients.map((ing) => {
        const qty = stockMap.get(`${store.id}:${ing.id}`) ?? 0;
        if (ing.lowStockQuantity != null && qty <= ing.lowStockQuantity) {
          lowStockCount += 1;
        }
        return {
          id: ing.id,
          name: ing.name,
          sku: ing.sku,
          unit: ing.unit,
          quantity: qty,
          lowStockQuantity: ing.lowStockQuantity,
        };
      });

      return {
        id: store.id,
        name: store.name,
        address: store.address,
        phone: store.phone,
        openingTime: store.openingTime,
        closingTime: store.closingTime,
        timezone: store.timezone,
        taxRate: store.taxRate,
        cashRegisters: store.cashRegisters,
        members: store.members.map((m) => m.user),
        revenue,
        orderCount,
        aov,
        unpaidOrdersCount: storeUnpaidOrders.length,
        unpaidAmount: storeUnpaidOrders.reduce((sum, o) => sum + o.totalAmount, 0),
        tablesCount: storeTables.length,
        occupiedTablesCount,
        reservedTablesCount,
        productsCount: storeProducts.length,
        ingredientsCount: storeIngredients.length,
        recipesCount: storeRecipes.length,
        lowStockCount,
        ingredientStocks,
      };
    });

    const totalRevenue = storeMetrics.reduce((sum, s) => sum + s.revenue, 0);
    const totalOrders = storeMetrics.reduce((sum, s) => sum + s.orderCount, 0);
    const totalTables = storeMetrics.reduce((sum, s) => sum + s.tablesCount, 0);
    const occupiedTables = storeMetrics.reduce((sum, s) => sum + s.occupiedTablesCount, 0);
    const lowStockAlertsCount = storeMetrics.reduce((sum, s) => sum + s.lowStockCount, 0);

    return {
      range,
      summary: {
        totalStores: stores.length,
        totalRevenue,
        totalOrders,
        averageOrderValue: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0,
        totalTables,
        occupiedTables,
        lowStockAlertsCount,
      },
      stores: storeMetrics,
    };
  }

  async create(actor: AuthenticatedUser, dto: CreateStoreDto) {
    this.assertPlatform(actor);
    const owner = await this.prisma.user.findUnique({
      where: { id: dto.ownerUserId },
      select: { id: true, isActive: true, role: true },
    });
    if (!owner || !owner.isActive) throw new NotFoundException('Tài khoản chủ/quản lý không hoạt động.');

    let createdStore: { id: string; name: string; timezone: string };
    try {
      createdStore = await this.prisma.$transaction(async (tx) => {
        const store = await tx.store.create({
          data: {
            name: dto.name.trim(),
            timezone: dto.timezone?.trim() || 'Asia/Ho_Chi_Minh',
            address: dto.address?.trim() || null,
            phone: dto.phone?.trim() || null,
            openingTime: dto.openingTime?.trim() || '08:00',
            closingTime: dto.closingTime?.trim() || '22:00',
          },
        });
        await tx.storeMember.upsert({
          where: { userId_storeId: { userId: owner.id, storeId: store.id } },
          create: { userId: owner.id, storeId: store.id },
          update: {},
        });
        if (actor.id !== owner.id) {
          await tx.storeMember.upsert({
            where: { userId_storeId: { userId: actor.id, storeId: store.id } },
            create: { userId: actor.id, storeId: store.id },
            update: {},
          });
        }
        await tx.cashRegister.create({
          data: { storeId: store.id, code: 'POS-01', name: 'Máy thu ngân quầy chính' },
        });
        await tx.inventoryLocation.create({
          data: { storeId: store.id, name: 'Kho bảo quản chính', kind: 'STORAGE' },
        });
        await tx.inventoryLocation.create({
          data: { storeId: store.id, name: 'Khu sơ chế bếp', kind: 'PREP' },
        });
        await this.audit.write(tx, {
          storeId: store.id,
          actorId: actor.id,
          action: 'STORE_CREATED',
          targetType: 'STORE',
          targetId: store.id,
          metadata: { name: store.name, ownerUserId: owner.id },
        });
        return store;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('Tên chi nhánh hoặc mã quầy đã tồn tại.');
      throw error;
    }

    let sourceStoreId = dto.syncFromStoreId;
    if (!sourceStoreId) {
      const primaryStore = await this.prisma.store.findFirst({
        where: { id: { not: createdStore.id } },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      sourceStoreId = primaryStore?.id;
    }

    if (sourceStoreId) {
      await this.syncStoreData(actor, {
        sourceStoreId,
        targetStoreIds: [createdStore.id],
        syncCatalog: true,
        syncIngredients: true,
        syncRecipes: true,
        syncTables: true,
      });
    }

    return createdStore;
  }

  async update(actor: AuthenticatedUser, storeId: string, dto: UpdateStoreDto) {
    this.assertPlatform(actor);
    const existing = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!existing) throw new NotFoundException('Chi nhánh không tồn tại.');

    const updated = await this.prisma.store.update({
      where: { id: storeId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.address !== undefined ? { address: dto.address.trim() || null } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone.trim() || null } : {}),
        ...(dto.openingTime !== undefined ? { openingTime: dto.openingTime.trim() } : {}),
        ...(dto.closingTime !== undefined ? { closingTime: dto.closingTime.trim() } : {}),
      },
    });

    await this.audit.write(this.prisma, {
      storeId,
      actorId: actor.id,
      action: 'STORE_UPDATED',
      targetType: 'STORE',
      targetId: storeId,
      metadata: { name: updated.name, address: updated.address, phone: updated.phone },
    });

    return updated;
  }

  async syncStoreData(actor: AuthenticatedUser, dto: SyncStoreDataDto) {
    this.assertPlatform(actor);
    const sourceStore = await this.prisma.store.findUnique({ where: { id: dto.sourceStoreId } });
    if (!sourceStore) throw new NotFoundException('Cửa hàng nguồn không tồn tại.');

    const targets = dto.targetStoreIds.filter((id) => id !== dto.sourceStoreId);
    if (targets.length === 0) {
      throw new BadRequestException('Vui lòng chọn ít nhất 1 chi nhánh đích khác chi nhánh nguồn.');
    }

    const doCatalog = dto.syncCatalog ?? true;
    const doIngredients = dto.syncIngredients ?? true;
    const doRecipes = dto.syncRecipes ?? true;
    const doTables = dto.syncTables ?? false;

    const [
      sourceCategories,
      sourceOptionGroups,
      sourceProducts,
      sourceIngredients,
      sourceSuppliers,
      sourceLocations,
      sourceRecipes,
      sourceTables,
    ] = await Promise.all([
      this.prisma.category.findMany({
        where: { storeId: dto.sourceStoreId },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.optionGroup.findMany({
        where: { storeId: dto.sourceStoreId },
        include: { options: true },
      }),
      this.prisma.product.findMany({
        where: { storeId: dto.sourceStoreId },
        include: {
          category: true,
          variants: { include: { prices: { orderBy: { startsAt: 'desc' }, take: 1 } } },
          optionGroups: { include: { optionGroup: true } },
        },
      }),
      this.prisma.ingredient.findMany({
        where: { storeId: dto.sourceStoreId },
      }),
      this.prisma.supplier.findMany({
        where: { storeId: dto.sourceStoreId },
      }),
      this.prisma.inventoryLocation.findMany({
        where: { storeId: dto.sourceStoreId },
      }),
      this.prisma.recipeRevision.findMany({
        where: { storeId: dto.sourceStoreId, isActive: true },
        include: {
          product: true,
          lines: { include: { ingredient: true } },
        },
      }),
      this.prisma.diningTable.findMany({
        where: { storeId: dto.sourceStoreId },
      }),
    ]);

    let categoriesSynced = 0;
    let optionGroupsSynced = 0;
    let productsSynced = 0;
    let ingredientsSynced = 0;
    let recipesSynced = 0;
    let tablesSynced = 0;

    for (const targetStoreId of targets) {
      const targetStore = await this.prisma.store.findUnique({ where: { id: targetStoreId } });
      if (!targetStore) continue;

      await this.prisma.$transaction(async (tx) => {
        // 1. Sync Ingredients, Suppliers & Locations
        const targetIngredientBySku = new Map<string, string>();
        if (doIngredients || doRecipes) {
          for (const loc of sourceLocations) {
            await tx.inventoryLocation.upsert({
              where: { storeId_name: { storeId: targetStoreId, name: loc.name } },
              create: {
                storeId: targetStoreId,
                name: loc.name,
                kind: loc.kind,
                isActive: loc.isActive,
              },
              update: { kind: loc.kind, isActive: loc.isActive },
            });
          }

          for (const sup of sourceSuppliers) {
            await tx.supplier.upsert({
              where: { storeId_name: { storeId: targetStoreId, name: sup.name } },
              create: {
                storeId: targetStoreId,
                name: sup.name,
                phone: sup.phone,
                note: sup.note,
                isActive: sup.isActive,
              },
              update: { phone: sup.phone, note: sup.note, isActive: sup.isActive },
            });
          }

          for (const ing of sourceIngredients) {
            const existingByName = await tx.ingredient.findUnique({
              where: { storeId_name: { storeId: targetStoreId, name: ing.name } },
            });
            let targetIngId: string;
            if (existingByName) {
              const u = await tx.ingredient.update({
                where: { id: existingByName.id },
                data: {
                  unit: ing.unit,
                  lowStockQuantity: ing.lowStockQuantity,
                  isActive: ing.isActive,
                },
              });
              targetIngId = u.id;
            } else {
              const u = await tx.ingredient.upsert({
                where: { storeId_sku: { storeId: targetStoreId, sku: ing.sku } },
                create: {
                  storeId: targetStoreId,
                  sku: ing.sku,
                  name: ing.name,
                  unit: ing.unit,
                  lowStockQuantity: ing.lowStockQuantity,
                  isActive: ing.isActive,
                },
                update: {
                  name: ing.name,
                  unit: ing.unit,
                  lowStockQuantity: ing.lowStockQuantity,
                  isActive: ing.isActive,
                },
              });
              targetIngId = u.id;
            }
            targetIngredientBySku.set(ing.sku, targetIngId);
            ingredientsSynced += 1;
          }
        }

        // 2. Sync Catalog (Categories, OptionGroups, Products, Variants, Prices)
        const targetCategoryByName = new Map<string, string>();
        const targetOptionGroupByName = new Map<string, string>();
        const targetProductByName = new Map<string, string>();

        if (doCatalog || doRecipes) {
          for (const cat of sourceCategories) {
            const c = await tx.category.upsert({
              where: { storeId_name: { storeId: targetStoreId, name: cat.name } },
              create: {
                storeId: targetStoreId,
                name: cat.name,
                sortOrder: cat.sortOrder,
                isActive: cat.isActive,
              },
              update: { sortOrder: cat.sortOrder, isActive: cat.isActive },
            });
            targetCategoryByName.set(cat.name, c.id);
            categoriesSynced += 1;
          }

          for (const og of sourceOptionGroups) {
            const targetOg = await tx.optionGroup.upsert({
              where: { storeId_name: { storeId: targetStoreId, name: og.name } },
              create: {
                storeId: targetStoreId,
                name: og.name,
                minSelections: og.minSelections,
                maxSelections: og.maxSelections,
              },
              update: {
                minSelections: og.minSelections,
                maxSelections: og.maxSelections,
              },
            });
            targetOptionGroupByName.set(og.name, targetOg.id);
            optionGroupsSynced += 1;

            for (const opt of og.options) {
              await tx.option.upsert({
                where: {
                  optionGroupId_name: { optionGroupId: targetOg.id, name: opt.name },
                },
                create: {
                  optionGroupId: targetOg.id,
                  name: opt.name,
                  priceDelta: opt.priceDelta,
                  isSoldOut: opt.isSoldOut,
                },
                update: { priceDelta: opt.priceDelta },
              });
            }
          }

          for (const prod of sourceProducts) {
            const catId = targetCategoryByName.get(prod.category.name);
            if (!catId) continue;

            let targetProd = await tx.product.findFirst({
              where: { storeId: targetStoreId, name: prod.name },
            });

            if (!targetProd) {
              targetProd = await tx.product.create({
                data: {
                  storeId: targetStoreId,
                  categoryId: catId,
                  name: prod.name,
                  imageUrl: prod.imageUrl,
                  isActive: prod.isActive,
                  isSoldOut: false,
                  inventoryMode: prod.inventoryMode,
                },
              });
            } else {
              targetProd = await tx.product.update({
                where: { id: targetProd.id },
                data: {
                  categoryId: catId,
                  imageUrl: prod.imageUrl,
                  isActive: prod.isActive,
                  inventoryMode: prod.inventoryMode,
                },
              });
            }
            targetProductByName.set(prod.name, targetProd.id);
            productsSynced += 1;

            for (const v of prod.variants) {
              const targetVar = await tx.productVariant.upsert({
                where: {
                  productId_name: { productId: targetProd.id, name: v.name },
                },
                create: {
                  productId: targetProd.id,
                  name: v.name,
                  isSoldOut: false,
                },
                update: {},
              });

              const latestPrice = v.prices[0]?.amount ?? 45000;
              const existingPrice = await tx.priceSchedule.findFirst({
                where: { variantId: targetVar.id },
                orderBy: { startsAt: 'desc' },
              });
              if (!existingPrice || existingPrice.amount !== latestPrice) {
                await tx.priceSchedule.create({
                  data: {
                    variantId: targetVar.id,
                    amount: latestPrice,
                    startsAt: new Date(Date.now() - 60_000),
                  },
                });
              }
            }

            for (const pog of prod.optionGroups) {
              const ogId = targetOptionGroupByName.get(pog.optionGroup.name);
              if (!ogId) continue;
              await tx.productOptionGroup.upsert({
                where: {
                  productId_optionGroupId: {
                    productId: targetProd.id,
                    optionGroupId: ogId,
                  },
                },
                create: { productId: targetProd.id, optionGroupId: ogId },
                update: {},
              });
            }
          }
        }

        // 3. Sync BOM Recipes
        if (doRecipes) {
          for (const rec of sourceRecipes) {
            const targetProdId = targetProductByName.get(rec.product.name);
            if (!targetProdId) continue;

            const mappedLines: Array<{ ingredientId: string; quantity: number }> = [];
            for (const line of rec.lines) {
              const targetIngId = targetIngredientBySku.get(line.ingredient.sku);
              if (targetIngId) {
                mappedLines.push({ ingredientId: targetIngId, quantity: line.quantity });
              }
            }
            if (mappedLines.length === 0) continue;

            await tx.recipeRevision.updateMany({
              where: { storeId: targetStoreId, productId: targetProdId, isActive: true },
              data: { isActive: false },
            });

            const maxRev = await tx.recipeRevision.aggregate({
              where: { productId: targetProdId },
              _max: { version: true },
            });
            const nextVersion = (maxRev._max.version ?? 0) + 1;

            await tx.recipeRevision.create({
              data: {
                storeId: targetStoreId,
                productId: targetProdId,
                version: nextVersion,
                isActive: true,
                createdById: actor.id,
                lines: {
                  create: mappedLines,
                },
              },
            });
            recipesSynced += 1;
          }
        }

        // 4. Sync Tables
        if (doTables) {
          for (const tbl of sourceTables) {
            await tx.diningTable.upsert({
              where: { storeId_code: { storeId: targetStoreId, code: tbl.code } },
              create: {
                storeId: targetStoreId,
                code: tbl.code,
                name: tbl.name,
                capacity: tbl.capacity,
                isActive: tbl.isActive,
              },
              update: {
                name: tbl.name,
                capacity: tbl.capacity,
                isActive: tbl.isActive,
              },
            });
            tablesSynced += 1;
          }
        }

        await this.audit.write(tx, {
          storeId: targetStoreId,
          actorId: actor.id,
          action: 'STORE_SYNCED_FROM_MASTER',
          targetType: 'STORE',
          targetId: targetStoreId,
          metadata: {
            sourceStoreId: dto.sourceStoreId,
            categoriesSynced,
            productsSynced,
            ingredientsSynced,
            recipesSynced,
          },
        });
      });
    }

    return {
      sourceStoreId: dto.sourceStoreId,
      targetCount: targets.length,
      categoriesSynced,
      optionGroupsSynced,
      productsSynced,
      ingredientsSynced,
      recipesSynced,
      tablesSynced,
    };
  }

  async interStoreTransfer(actor: AuthenticatedUser, dto: InterStoreTransferDto) {
    this.assertPlatform(actor);
    if (dto.fromStoreId === dto.toStoreId) {
      throw new BadRequestException('Chi nhánh xuất và chi nhánh nhận phải khác nhau.');
    }

    const [fromStore, toStore, sourceIngredient] = await Promise.all([
      this.prisma.store.findUnique({ where: { id: dto.fromStoreId } }),
      this.prisma.store.findUnique({ where: { id: dto.toStoreId } }),
      this.prisma.ingredient.findUnique({ where: { id: dto.ingredientId } }),
    ]);

    if (!fromStore || !toStore) throw new NotFoundException('Chi nhánh không tồn tại.');
    if (!sourceIngredient || sourceIngredient.storeId !== dto.fromStoreId) {
      throw new NotFoundException('Nguyên vật liệu không thuộc chi nhánh xuất.');
    }

    const qty = Math.round(dto.quantity);
    if (qty <= 0) throw new BadRequestException('Số lượng điều chuyển phải lớn hơn 0.');

    return this.prisma.$transaction(async (tx) => {
      // Find source stock grouped by location and lot
      const ledgerRows = await tx.inventoryLedgerEntry.groupBy({
        by: ['locationId', 'lotId'],
        where: {
          storeId: dto.fromStoreId,
          ingredientId: sourceIngredient.id,
        },
        _sum: { quantity: true },
      });

      const availableRows = ledgerRows
        .map((r) => ({
          locationId: r.locationId,
          lotId: r.lotId,
          quantity: r._sum.quantity ?? 0,
        }))
        .filter((r) => r.quantity > 0);

      const totalAvailable = availableRows.reduce((sum, r) => sum + r.quantity, 0);
      if (totalAvailable < qty) {
        throw new BadRequestException(
          `Tồn kho tại ${fromStore.name} không đủ để điều chuyển (Hiện có: ${totalAvailable}, Cần chuyển: ${qty}).`,
        );
      }

      // Fetch lot details for FEFO ordering
      const lotIds = availableRows.map((r) => r.lotId).filter((id): id is string => Boolean(id));
      const lots = await tx.stockLot.findMany({
        where: { id: { in: lotIds } },
      });
      const lotMap = new Map(lots.map((l) => [l.id, l]));

      availableRows.sort((a, b) => {
        const expA = a.lotId ? lotMap.get(a.lotId)?.expiresAt?.getTime() ?? Infinity : Infinity;
        const expB = b.lotId ? lotMap.get(b.lotId)?.expiresAt?.getTime() ?? Infinity : Infinity;
        return expA - expB;
      });

      // Ensure target ingredient & storage location exist in toStore
      let targetLocation = await tx.inventoryLocation.findFirst({
        where: { storeId: dto.toStoreId, kind: 'STORAGE', isActive: true },
      });
      if (!targetLocation) {
        targetLocation = await tx.inventoryLocation.create({
          data: { storeId: dto.toStoreId, name: 'Kho bảo quản chính', kind: 'STORAGE' },
        });
      }

      let targetIngredient = await tx.ingredient.findFirst({
        where: {
          storeId: dto.toStoreId,
          OR: [{ sku: sourceIngredient.sku }, { name: sourceIngredient.name }],
        },
      });
      if (!targetIngredient) {
        targetIngredient = await tx.ingredient.create({
          data: {
            storeId: dto.toStoreId,
            sku: sourceIngredient.sku,
            name: sourceIngredient.name,
            unit: sourceIngredient.unit,
            lowStockQuantity: sourceIngredient.lowStockQuantity,
            isActive: true,
          },
        });
      }

      const transferId = randomUUID();
      const noteText =
        dto.note?.trim() ||
        `Điều chuyển liên chi nhánh: ${fromStore.name} ➔ ${toStore.name}`;

      // Deduct from source store (FEFO)
      let remaining = qty;
      let weightedCostSum = 0;
      let earliestExpiry: Date | null = null;

      for (const row of availableRows) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, row.quantity);
        remaining -= take;

        const lot = row.lotId ? lotMap.get(row.lotId) : undefined;
        const unitCost = lot?.unitCost ?? 100;
        weightedCostSum += take * unitCost;
        if (lot?.expiresAt && (!earliestExpiry || lot.expiresAt < earliestExpiry)) {
          earliestExpiry = lot.expiresAt;
        }

        await tx.inventoryLedgerEntry.create({
          data: {
            storeId: dto.fromStoreId,
            ingredientId: sourceIngredient.id,
            locationId: row.locationId,
            lotId: row.lotId,
            type: InventoryLedgerType.TRANSFER_OUT,
            quantity: -take,
            sourceType: 'INTER_STORE_TRANSFER',
            sourceId: transferId,
            note: `${noteText} (Xuất sang ${toStore.name})`,
            actorId: actor.id,
          },
        });
      }

      // Receive into target store with a GoodsReceipt & StockLot
      const avgUnitCost = Math.round(weightedCostSum / qty) || 100;
      const lotCode = `IST-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${transferId.slice(0, 4).toUpperCase()}`;

      const receipt = await tx.goodsReceipt.create({
        data: {
          storeId: dto.toStoreId,
          locationId: targetLocation.id,
          reference: lotCode,
          receivedById: actor.id,
          note: `${noteText} (Nhận từ ${fromStore.name})`,
          lines: {
            create: [
              {
                ingredientId: targetIngredient.id,
                quantity: qty,
                unitCost: avgUnitCost,
                lotCode,
                expiresAt: earliestExpiry,
              },
            ],
          },
        },
        include: { lines: true },
      });

      const receiptLine = receipt.lines[0];
      const newLot = await tx.stockLot.create({
        data: {
          storeId: dto.toStoreId,
          ingredientId: targetIngredient.id,
          receiptLineId: receiptLine.id,
          code: lotCode,
          receivedAt: new Date(),
          expiresAt: earliestExpiry,
          unitCost: avgUnitCost,
        },
      });

      await tx.inventoryLedgerEntry.create({
        data: {
          storeId: dto.toStoreId,
          ingredientId: targetIngredient.id,
          locationId: targetLocation.id,
          lotId: newLot.id,
          type: InventoryLedgerType.TRANSFER_IN,
          quantity: qty,
          sourceType: 'INTER_STORE_TRANSFER',
          sourceId: transferId,
          note: `${noteText} (Nhận từ ${fromStore.name})`,
          actorId: actor.id,
        },
      });

      await this.audit.write(tx, {
        storeId: dto.fromStoreId,
        actorId: actor.id,
        action: 'INTER_STORE_STOCK_TRANSFERRED',
        targetType: 'INGREDIENT',
        targetId: sourceIngredient.id,
        metadata: {
          fromStoreId: dto.fromStoreId,
          toStoreId: dto.toStoreId,
          ingredientName: sourceIngredient.name,
          quantity: qty,
          lotCode,
        },
      });

      return {
        transferId,
        fromStore: fromStore.name,
        toStore: toStore.name,
        ingredientName: sourceIngredient.name,
        unit: sourceIngredient.unit,
        quantity: qty,
        lotCode,
      };
    });
  }

  async listRegisters(actor: AuthenticatedUser, storeId: string) {
    this.assertStore(actor, storeId);
    return this.prisma.cashRegister.findMany({
      where: { storeId, isActive: true },
      orderBy: { code: 'asc' },
    });
  }

  async createRegister(actor: AuthenticatedUser, dto: CreateCashRegisterDto) {
    this.assertStore(actor, dto.storeId);
    try {
      const register = await this.prisma.cashRegister.create({
        data: {
          storeId: dto.storeId,
          name: dto.name.trim(),
          code: dto.code.trim().toUpperCase(),
        },
      });
      await this.audit.write(this.prisma, {
        storeId: dto.storeId,
        actorId: actor.id,
        action: 'CASH_REGISTER_CREATED',
        targetType: 'CASH_REGISTER',
        targetId: register.id,
        metadata: { name: register.name, code: register.code },
      });
      return register;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('Mã máy thu ngân đã tồn tại tại chi nhánh này.');
      throw error;
    }
  }

  private assertPlatform(actor: AuthenticatedUser) {
    if (!actor.isPlatformAdmin)
      throw new ForbiddenException('Chỉ tài khoản Chủ chuỗi (Super Admin) mới có quyền thực hiện.');
  }

  private assertStore(actor: AuthenticatedUser, storeId: string) {
    if (!actor.isPlatformAdmin && !actor.storeIds.includes(storeId))
      throw new ForbiddenException('Không có quyền truy cập chi nhánh này.');
  }
}
