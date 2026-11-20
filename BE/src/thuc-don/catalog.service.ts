import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryMode, Prisma } from '@prisma/client';
import { PrismaService } from '../co-so-du-lieu/prisma.service.js';
import { AuditService } from '../nhat-ky-kiem-toan/audit.service.js';
import type { AuthenticatedUser } from '../xac-thuc-phan-quyen/kieu-du-lieu/authenticated-user.js';
import type { CreateCategoryDto } from './du-lieu-dau-vao/create-category.dto.js';
import type { CreateOptionDto } from './du-lieu-dau-vao/create-option.dto.js';
import type { CreateProductDto } from './du-lieu-dau-vao/create-product.dto.js';
import type { CreateOptionGroupDto } from './du-lieu-dau-vao/create-option-group.dto.js';
import type { CreateVariantDto } from './du-lieu-dau-vao/create-variant.dto.js';
import type { LinkOptionGroupDto } from './du-lieu-dau-vao/link-option-group.dto.js';
import type { CreatePriceDto } from './du-lieu-dau-vao/create-price.dto.js';
import type { UpdateCategoryDto } from './du-lieu-dau-vao/update-category.dto.js';
import type { UpdateOptionDto } from './du-lieu-dau-vao/update-option.dto.js';
import type { UpdateOptionGroupDto } from './du-lieu-dau-vao/update-option-group.dto.js';
import type { UpdatePriceDto } from './du-lieu-dau-vao/update-price.dto.js';
import type { UpdateProductDto } from './du-lieu-dau-vao/update-product.dto.js';
import type { UpdateVariantDto } from './du-lieu-dau-vao/update-variant.dto.js';
@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}
  async listCategories(actor: AuthenticatedUser, storeId: string) {
    this.assertStore(actor, storeId);
    return this.prisma.category.findMany({
      where: { storeId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }
  async assertProductInStore(actor: AuthenticatedUser, productId: string) {
    await this.product(actor, productId);
  }
  async createCategory(actor: AuthenticatedUser, dto: CreateCategoryDto) {
    this.assertStore(actor, dto.storeId);
    const created = await this.write(() => this.prisma.category.create({ data: dto }));
    if (this.isChainAdmin(actor)) {
      const otherStores = await this.otherStoreIds(dto.storeId);
      for (const targetStoreId of otherStores) {
        await this.prisma.category
          .upsert({
            where: { storeId_name: { storeId: targetStoreId, name: created.name } },
            update: { sortOrder: created.sortOrder, isActive: created.isActive },
            create: {
              storeId: targetStoreId,
              name: created.name,
              sortOrder: created.sortOrder,
              isActive: created.isActive,
            },
          })
          .catch(() => undefined);
      }
    }
    return created;
  }
  async updateCategory(actor: AuthenticatedUser, id: string, dto: UpdateCategoryDto) {
    const category = await this.category(actor, id);
    const updated = await this.write(() =>
      this.prisma.category.update({ where: { id: category.id }, data: dto }),
    );
    if (this.isChainAdmin(actor)) {
      const otherStores = await this.otherStoreIds(category.storeId);
      if (otherStores.length > 0) {
        await this.prisma.category
          .updateMany({
            where: { storeId: { in: otherStores }, name: category.name },
            data: dto,
          })
          .catch(() => undefined);
      }
    }
    return updated;
  }
  async deleteCategory(actor: AuthenticatedUser, id: string) {
    const category = await this.category(actor, id);
    const deleted = await this.write(
      () => this.prisma.category.delete({ where: { id: category.id } }),
      'A category with products cannot be deleted.',
    );
    if (this.isChainAdmin(actor)) {
      const otherStores = await this.otherStoreIds(category.storeId);
      for (const targetStoreId of otherStores) {
        await this.prisma.category
          .deleteMany({
            where: { storeId: targetStoreId, name: category.name, products: { none: {} } },
          })
          .catch(() => undefined);
      }
    }
    return deleted;
  }

  async listProducts(actor: AuthenticatedUser, storeId: string) {
    this.assertStore(actor, storeId);
    return this.prisma.product.findMany({
      where: { storeId },
      orderBy: { name: 'asc' },
      include: {
        category: true,
        variants: {
          include: { prices: { orderBy: { startsAt: 'desc' } } },
          orderBy: { name: 'asc' },
        },
        optionGroups: { include: { optionGroup: true } },
      },
    });
  }
  async createProduct(actor: AuthenticatedUser, dto: CreateProductDto) {
    this.assertStore(actor, dto.storeId);
    const sourceCategory = await this.categoryForStore(dto.categoryId, dto.storeId);
    const created = await this.write(() =>
      this.prisma.product.create({
        data: {
          storeId: dto.storeId,
          categoryId: dto.categoryId,
          name: dto.name,
          imageUrl: dto.imageUrl,
          variants: { create: dto.variants },
        },
        include: { variants: true },
      }),
    );
    if (this.isChainAdmin(actor)) {
      const otherStores = await this.otherStoreIds(dto.storeId);
      for (const targetStoreId of otherStores) {
        try {
          const targetCat = await this.prisma.category.upsert({
            where: { storeId_name: { storeId: targetStoreId, name: sourceCategory.name } },
            update: {},
            create: {
              storeId: targetStoreId,
              name: sourceCategory.name,
              sortOrder: sourceCategory.sortOrder,
              isActive: sourceCategory.isActive,
            },
          });
          const existingProd = await this.prisma.product.findFirst({
            where: { storeId: targetStoreId, name: created.name },
          });
          if (!existingProd) {
            await this.prisma.product.create({
              data: {
                storeId: targetStoreId,
                categoryId: targetCat.id,
                name: created.name,
                imageUrl: created.imageUrl,
                variants: {
                  create: (dto.variants ?? []).map((v) => ({
                    name: v.name,
                  })),
                },
              },
            });
          }
        } catch {
          // Ignore individual store conflicts (e.g. custom SKU already used in target store)
        }
      }
    }
    return created;
  }
  async updateProduct(actor: AuthenticatedUser, id: string, dto: UpdateProductDto) {
    const product = await this.product(actor, id);
    let newCategoryName: string | undefined;
    if (dto.categoryId) {
      const cat = await this.categoryForStore(dto.categoryId, product.storeId);
      newCategoryName = cat.name;
    }
    if (dto.inventoryMode === InventoryMode.TRACKED) {
      const activeRecipe = await this.prisma.recipeRevision.findFirst({
        where: { storeId: product.storeId, productId: product.id, isActive: true },
        select: { id: true },
      });
      if (!activeRecipe)
        throw new BadRequestException(
          'Create an active recipe before enabling inventory tracking for this product.',
        );
    }
    const updated = await this.write(() => this.prisma.product.update({ where: { id }, data: dto }));
    const isSoldOutOnly =
      dto.isSoldOut !== undefined &&
      dto.name === undefined &&
      dto.categoryId === undefined &&
      dto.imageUrl === undefined &&
      dto.isActive === undefined &&
      dto.inventoryMode === undefined;
    if (this.isChainAdmin(actor) && !isSoldOutOnly) {
      const otherStores = await this.otherStoreIds(product.storeId);
      for (const targetStoreId of otherStores) {
        try {
          const targetProd = await this.prisma.product.findFirst({
            where: { storeId: targetStoreId, name: product.name },
          });
          if (!targetProd) continue;
          let targetCategoryId: string | undefined;
          if (newCategoryName) {
            const targetCat = await this.prisma.category.findUnique({
              where: { storeId_name: { storeId: targetStoreId, name: newCategoryName } },
            });
            if (targetCat) targetCategoryId = targetCat.id;
          }
          let targetInventoryMode = dto.inventoryMode;
          if (targetInventoryMode === InventoryMode.TRACKED) {
            const hasTargetRecipe = await this.prisma.recipeRevision.findFirst({
              where: { storeId: targetStoreId, productId: targetProd.id, isActive: true },
              select: { id: true },
            });
            if (!hasTargetRecipe) targetInventoryMode = undefined;
          }
          await this.prisma.product.update({
            where: { id: targetProd.id },
            data: {
              ...(dto.name !== undefined ? { name: dto.name } : {}),
              ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {}),
              ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
              ...(targetCategoryId ? { categoryId: targetCategoryId } : {}),
              ...(targetInventoryMode !== undefined ? { inventoryMode: targetInventoryMode } : {}),
            },
          });
        } catch {
          // Ignore individual store conflict
        }
      }
    }
    return updated;
  }
  async deleteProduct(actor: AuthenticatedUser, id: string) {
    const product = await this.product(actor, id);
    const deleted = await this.prisma.product.delete({ where: { id: product.id } });
    if (this.isChainAdmin(actor)) {
      const otherStores = await this.otherStoreIds(product.storeId);
      for (const targetStoreId of otherStores) {
        await this.prisma.product
          .deleteMany({ where: { storeId: targetStoreId, name: product.name } })
          .catch(() => undefined);
      }
    }
    return deleted;
  }
  async createVariant(actor: AuthenticatedUser, productId: string, dto: CreateVariantDto) {
    const product = await this.product(actor, productId);
    const created = await this.write(() =>
      this.prisma.productVariant.create({ data: { productId: product.id, ...dto } }),
    );
    if (this.isChainAdmin(actor)) {
      const otherStores = await this.otherStoreIds(product.storeId);
      for (const targetStoreId of otherStores) {
        try {
          const targetProd = await this.prisma.product.findFirst({
            where: { storeId: targetStoreId, name: product.name },
          });
          if (!targetProd) continue;
          const exists = await this.prisma.productVariant.findFirst({
            where: { productId: targetProd.id, name: dto.name },
          });
          if (!exists) {
            await this.prisma.productVariant.create({
              data: { productId: targetProd.id, ...dto },
            });
          }
        } catch {
          // Ignore
        }
      }
    }
    return created;
  }
  async updateVariant(actor: AuthenticatedUser, id: string, dto: UpdateVariantDto) {
    const variant = await this.variant(actor, id);
    const updated = await this.write(() =>
      this.prisma.productVariant.update({ where: { id: variant.id }, data: dto }),
    );
    const isSoldOutOnly = dto.isSoldOut !== undefined && dto.name === undefined;
    if (this.isChainAdmin(actor) && !isSoldOutOnly) {
      const otherStores = await this.otherStoreIds(variant.product.storeId);
      for (const targetStoreId of otherStores) {
        await this.prisma.productVariant
          .updateMany({
            where: {
              name: variant.name,
              product: { storeId: targetStoreId, name: variant.product.name },
            },
            data: {
              ...(dto.name !== undefined ? { name: dto.name } : {}),
            },
          })
          .catch(() => undefined);
      }
    }
    return updated;
  }
  async deleteVariant(actor: AuthenticatedUser, id: string) {
    const variant = await this.variant(actor, id);
    const deleted = await this.prisma.productVariant.delete({ where: { id: variant.id } });
    if (this.isChainAdmin(actor)) {
      const otherStores = await this.otherStoreIds(variant.product.storeId);
      for (const targetStoreId of otherStores) {
        await this.prisma.productVariant
          .deleteMany({
            where: {
              name: variant.name,
              product: { storeId: targetStoreId, name: variant.product.name },
            },
          })
          .catch(() => undefined);
      }
    }
    return deleted;
  }

  async listOptionGroups(actor: AuthenticatedUser, storeId: string) {
    this.assertStore(actor, storeId);
    return this.prisma.optionGroup.findMany({
      where: { storeId },
      orderBy: { name: 'asc' },
      include: { options: { orderBy: { name: 'asc' } }, products: true },
    });
  }
  async createOptionGroup(actor: AuthenticatedUser, dto: CreateOptionGroupDto) {
    this.assertStore(actor, dto.storeId);
    this.assertSelectionBounds(dto.minSelections, dto.maxSelections);
    const created = await this.write(() =>
      this.prisma.optionGroup.create({
        data: {
          storeId: dto.storeId,
          name: dto.name,
          minSelections: dto.minSelections,
          maxSelections: dto.maxSelections,
          options: { create: dto.options },
        },
        include: { options: true },
      }),
    );
    if (this.isChainAdmin(actor)) {
      const otherStores = await this.otherStoreIds(dto.storeId);
      for (const targetStoreId of otherStores) {
        try {
          const existing = await this.prisma.optionGroup.findUnique({
            where: { storeId_name: { storeId: targetStoreId, name: created.name } },
          });
          if (!existing) {
            await this.prisma.optionGroup.create({
              data: {
                storeId: targetStoreId,
                name: created.name,
                minSelections: created.minSelections,
                maxSelections: created.maxSelections,
                options: { create: dto.options },
              },
            });
          }
        } catch {
          // Ignore
        }
      }
    }
    return created;
  }
  async updateOptionGroup(actor: AuthenticatedUser, id: string, dto: UpdateOptionGroupDto) {
    const group = await this.optionGroup(actor, id);
    this.assertSelectionBounds(
      dto.minSelections ?? group.minSelections,
      dto.maxSelections ?? group.maxSelections,
    );
    const updated = await this.write(() =>
      this.prisma.optionGroup.update({
        where: { id: group.id },
        data: dto,
        include: { options: true },
      }),
    );
    if (this.isChainAdmin(actor)) {
      const otherStores = await this.otherStoreIds(group.storeId);
      if (otherStores.length > 0) {
        await this.prisma.optionGroup
          .updateMany({
            where: { storeId: { in: otherStores }, name: group.name },
            data: dto,
          })
          .catch(() => undefined);
      }
    }
    return updated;
  }
  async deleteOptionGroup(actor: AuthenticatedUser, id: string) {
    const group = await this.optionGroup(actor, id);
    const deleted = await this.prisma.optionGroup.delete({ where: { id: group.id } });
    if (this.isChainAdmin(actor)) {
      const otherStores = await this.otherStoreIds(group.storeId);
      if (otherStores.length > 0) {
        await this.prisma.optionGroup
          .deleteMany({ where: { storeId: { in: otherStores }, name: group.name } })
          .catch(() => undefined);
      }
    }
    return deleted;
  }
  async createOption(actor: AuthenticatedUser, groupId: string, dto: CreateOptionDto) {
    const group = await this.optionGroup(actor, groupId);
    const created = await this.write(() =>
      this.prisma.option.create({ data: { optionGroupId: group.id, ...dto } }),
    );
    if (this.isChainAdmin(actor)) {
      const otherStores = await this.otherStoreIds(group.storeId);
      for (const targetStoreId of otherStores) {
        try {
          const targetGroup = await this.prisma.optionGroup.findUnique({
            where: { storeId_name: { storeId: targetStoreId, name: group.name } },
          });
          if (targetGroup) {
            await this.prisma.option.upsert({
              where: {
                optionGroupId_name: { optionGroupId: targetGroup.id, name: created.name },
              },
              update: { priceDelta: created.priceDelta },
              create: {
                optionGroupId: targetGroup.id,
                name: created.name,
                priceDelta: created.priceDelta,
              },
            });
          }
        } catch {
          // Ignore
        }
      }
    }
    return created;
  }
  async updateOption(actor: AuthenticatedUser, id: string, dto: UpdateOptionDto) {
    const option = await this.option(actor, id);
    const updated = await this.write(() =>
      this.prisma.option.update({ where: { id: option.id }, data: dto }),
    );
    const isSoldOutOnly =
      dto.isSoldOut !== undefined && dto.name === undefined && dto.priceDelta === undefined;
    if (this.isChainAdmin(actor) && !isSoldOutOnly) {
      const otherStores = await this.otherStoreIds(option.group.storeId);
      for (const targetStoreId of otherStores) {
        await this.prisma.option
          .updateMany({
            where: {
              name: option.name,
              group: { storeId: targetStoreId, name: option.group.name },
            },
            data: {
              ...(dto.name !== undefined ? { name: dto.name } : {}),
              ...(dto.priceDelta !== undefined ? { priceDelta: dto.priceDelta } : {}),
            },
          })
          .catch(() => undefined);
      }
    }
    return updated;
  }
  async deleteOption(actor: AuthenticatedUser, id: string) {
    const option = await this.option(actor, id);
    const deleted = await this.prisma.option.delete({ where: { id: option.id } });
    if (this.isChainAdmin(actor)) {
      const otherStores = await this.otherStoreIds(option.group.storeId);
      for (const targetStoreId of otherStores) {
        await this.prisma.option
          .deleteMany({
            where: {
              name: option.name,
              group: { storeId: targetStoreId, name: option.group.name },
            },
          })
          .catch(() => undefined);
      }
    }
    return deleted;
  }

  async setProductSoldOut(actor: AuthenticatedUser, id: string, isSoldOut: boolean) {
    return this.updateProduct(actor, id, { isSoldOut });
  }
  async setVariantSoldOut(actor: AuthenticatedUser, id: string, isSoldOut: boolean) {
    return this.updateVariant(actor, id, { isSoldOut });
  }
  async setOptionSoldOut(actor: AuthenticatedUser, id: string, isSoldOut: boolean) {
    return this.updateOption(actor, id, { isSoldOut });
  }
  async linkOptionGroup(actor: AuthenticatedUser, productId: string, dto: LinkOptionGroupDto) {
    const product = await this.product(actor, productId);
    const group = await this.optionGroup(actor, dto.optionGroupId);
    if (product.storeId !== group.storeId)
      throw new ForbiddenException('Option group belongs to another store.');
    const linked = await this.prisma.productOptionGroup.upsert({
      where: { productId_optionGroupId: { productId, optionGroupId: group.id } },
      update: {},
      create: { productId, optionGroupId: group.id },
    });
    if (this.isChainAdmin(actor)) {
      const otherStores = await this.otherStoreIds(product.storeId);
      for (const targetStoreId of otherStores) {
        try {
          const [targetProd, targetGroup] = await Promise.all([
            this.prisma.product.findFirst({ where: { storeId: targetStoreId, name: product.name } }),
            this.prisma.optionGroup.findUnique({
              where: { storeId_name: { storeId: targetStoreId, name: group.name } },
            }),
          ]);
          if (targetProd && targetGroup) {
            await this.prisma.productOptionGroup.upsert({
              where: {
                productId_optionGroupId: {
                  productId: targetProd.id,
                  optionGroupId: targetGroup.id,
                },
              },
              update: {},
              create: { productId: targetProd.id, optionGroupId: targetGroup.id },
            });
          }
        } catch {
          // Ignore
        }
      }
    }
    return linked;
  }
  async unlinkOptionGroup(actor: AuthenticatedUser, productId: string, optionGroupId: string) {
    const product = await this.product(actor, productId);
    const group = await this.optionGroup(actor, optionGroupId).catch(() => null);
    await this.prisma.productOptionGroup.deleteMany({
      where: { productId: product.id, optionGroupId },
    });
    if (this.isChainAdmin(actor) && group) {
      const otherStores = await this.otherStoreIds(product.storeId);
      for (const targetStoreId of otherStores) {
        await this.prisma.productOptionGroup
          .deleteMany({
            where: {
              product: { storeId: targetStoreId, name: product.name },
              optionGroup: { storeId: targetStoreId, name: group.name },
            },
          })
          .catch(() => undefined);
      }
    }
    return { productId: product.id, optionGroupId };
  }

  async listPrices(actor: AuthenticatedUser, storeId: string) {
    this.assertStore(actor, storeId);
    return this.prisma.priceSchedule.findMany({
      where: { variant: { product: { storeId } } },
      orderBy: { startsAt: 'desc' },
      include: { variant: { include: { product: { select: { id: true, name: true } } } } },
    });
  }
  async createPrice(actor: AuthenticatedUser, dto: CreatePriceDto) {
    const variant = await this.variant(actor, dto.variantId);
    const startsAt = this.date(dto.startsAt);
    const endsAt = dto.endsAt ? this.date(dto.endsAt) : null;
    this.assertPriceBounds(startsAt, endsAt);
    const applyVariantPrice = async (targetVariantId: string) =>
      this.prisma.$transaction(async (tx) => {
        const overlaps = await tx.priceSchedule.findMany({
          where: {
            variantId: targetVariantId,
            AND: [
              { startsAt: { lt: endsAt ?? new Date('9999-12-31') } },
              { OR: [{ endsAt: null }, { endsAt: { gt: startsAt } }] },
            ],
          },
        });
        for (const existing of overlaps) {
          if (existing.startsAt < startsAt) {
            await tx.priceSchedule.update({
              where: { id: existing.id },
              data: { endsAt: startsAt },
            });
          } else {
            await tx.priceSchedule.delete({
              where: { id: existing.id },
            });
          }
        }
        return tx.priceSchedule.create({
          data: { variantId: targetVariantId, amount: dto.amount, startsAt, endsAt },
        });
      });

    const created = await applyVariantPrice(variant.id);
    await this.audit.write(this.prisma, {
      storeId: variant.product.storeId,
      actorId: actor.id,
      action: 'PRICE_SCHEDULE_CREATED',
      targetType: 'PRICE_SCHEDULE',
      targetId: created.id,
      metadata: { after: this.priceSnapshot(created) },
    });

    if (this.isChainAdmin(actor)) {
      const otherStores = await this.otherStoreIds(variant.product.storeId);
      if (otherStores.length > 0) {
        const peerVariants = await this.prisma.productVariant.findMany({
          where: {
            name: variant.name,
            product: { storeId: { in: otherStores }, name: variant.product.name },
          },
          select: { id: true },
        });
        for (const peer of peerVariants) {
          await applyVariantPrice(peer.id).catch(() => undefined);
        }
      }
    }
    return created;
  }
  async updatePrice(actor: AuthenticatedUser, id: string, dto: UpdatePriceDto) {
    const schedule = await this.price(actor, id);
    const startsAt = dto.startsAt === undefined ? schedule.startsAt : this.date(dto.startsAt);
    const endsAt =
      dto.endsAt === undefined
        ? schedule.endsAt
        : dto.endsAt === null
          ? null
          : this.date(dto.endsAt);
    this.assertPriceBounds(startsAt, endsAt);
    await this.assertNoOverlap(schedule.variantId, startsAt, endsAt, schedule.id);
    const updated = await this.write(
      () =>
        this.prisma.priceSchedule.update({
          where: { id: schedule.id },
          data: { amount: dto.amount, startsAt, endsAt },
        }),
      'Price schedule overlaps an existing price.',
    );
    await this.audit.write(this.prisma, {
      storeId: schedule.variant.product.storeId,
      actorId: actor.id,
      action: 'PRICE_SCHEDULE_UPDATED',
      targetType: 'PRICE_SCHEDULE',
      targetId: updated.id,
      metadata: { before: this.priceSnapshot(schedule), after: this.priceSnapshot(updated) },
    });
    return updated;
  }
  async deletePrice(actor: AuthenticatedUser, id: string) {
    const schedule = await this.price(actor, id);
    const deleted = await this.prisma.priceSchedule.delete({ where: { id: schedule.id } });
    await this.audit.write(this.prisma, {
      storeId: schedule.variant.product.storeId,
      actorId: actor.id,
      action: 'PRICE_SCHEDULE_DELETED',
      targetType: 'PRICE_SCHEDULE',
      targetId: deleted.id,
      metadata: { before: this.priceSnapshot(schedule) },
    });
    return deleted;
  }

  async menu(actor: AuthenticatedUser, storeId: string) {
    this.assertStore(actor, storeId);
    const now = new Date();
    const activePrice = { startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] };
    const availableVariant = { isSoldOut: false, prices: { some: activePrice } };
    const availableProduct = {
      isActive: true,
      isSoldOut: false,
      variants: { some: availableVariant },
    };
    const [categories, activeLocations] = await Promise.all([
      this.prisma.category.findMany({
        where: { storeId, isActive: true, products: { some: availableProduct } },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: {
          products: {
            where: availableProduct,
            include: {
              variants: {
                where: availableVariant,
                include: { prices: { where: activePrice, orderBy: { startsAt: 'desc' }, take: 1 } },
              },
              optionGroups: {
                include: {
                  optionGroup: {
                    include: { options: { where: { isSoldOut: false }, orderBy: { name: 'asc' } } },
                  },
                },
              },
              recipeRevisions: {
                where: { isActive: true },
                include: { lines: { include: { ingredient: true } } },
                take: 1,
              },
            },
          },
        },
      }),
      this.prisma.inventoryLocation.findMany({
        where: { storeId, isActive: true },
        select: { id: true },
      }),
    ]);

    const groups = activeLocations.length
      ? await this.prisma.inventoryLedgerEntry.groupBy({
          by: ['ingredientId', 'lotId'],
          where: { storeId, locationId: { in: activeLocations.map((l) => l.id) } },
          _sum: { quantity: true },
        })
      : [];
    const nonZero = groups.filter((g) => (g._sum.quantity ?? 0) > 0);
    const lotIds = nonZero.flatMap((g) => (g.lotId ? [g.lotId] : []));
    const lots = lotIds.length
      ? await this.prisma.stockLot.findMany({
          where: { id: { in: lotIds } },
          select: { id: true, expiresAt: true },
        })
      : [];
    const lotById = new Map(lots.map((l) => [l.id, l]));
    const availableByIngredient = new Map<string, number>();
    for (const g of nonZero) {
      const lot = g.lotId ? lotById.get(g.lotId) : undefined;
      if (lot?.expiresAt && lot.expiresAt < now) continue;
      availableByIngredient.set(
        g.ingredientId,
        (availableByIngredient.get(g.ingredientId) ?? 0) + (g._sum.quantity ?? 0),
      );
    }

    return categories.map((category) => ({
      ...category,
      products: category.products.map(({ recipeRevisions, ...product }) => {
        const recipe = recipeRevisions[0];
        const hasRecipe = Boolean(recipe && recipe.lines.length > 0);
        const recipeSummary = hasRecipe
          ? recipe.lines.map((line) => ({
              ingredientId: line.ingredientId,
              name: line.ingredient.name,
              unit: line.ingredient.unit,
              required: line.quantity,
              available: availableByIngredient.get(line.ingredientId) ?? 0,
            }))
          : [];
        const availableServings = hasRecipe
          ? Math.min(
              ...recipeSummary.map((r) =>
                r.required > 0 ? Math.floor(r.available / r.required) : 9999,
              ),
            )
          : product.inventoryMode === 'TRACKED'
            ? 0
            : null;
        return {
          ...product,
          hasRecipe,
          availableServings,
          recipeSummary,
        };
      }),
    }));
  }

  /** Internal POS quote. It intentionally re-reads the sellable menu at checkout time. */
  async sellableVariant(storeId: string, variantId: string, optionIds: string[]) {
    const now = new Date();
    const variant = await this.prisma.productVariant.findFirst({
      where: {
        id: variantId,
        isSoldOut: false,
        product: { storeId, isActive: true, isSoldOut: false, category: { isActive: true } },
      },
      include: {
        product: {
          include: {
            optionGroups: {
              include: { optionGroup: { include: { options: { where: { isSoldOut: false } } } } },
            },
          },
        },
        prices: {
          where: { startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
          orderBy: { startsAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!variant || !variant.prices[0])
      throw new BadRequestException('Variant is no longer sellable.');
    const selected = new Set(optionIds);
    if (selected.size !== optionIds.length)
      throw new BadRequestException('An option can only be selected once.');
    const allowed = new Map<
      string,
      { id: string; name: string; priceDelta: number; optionGroupId: string }
    >();
    for (const link of variant.product.optionGroups)
      for (const option of link.optionGroup.options)
        allowed.set(option.id, { ...option, optionGroupId: link.optionGroupId });
    const options = optionIds
      .map((id) => allowed.get(id))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    if (options.length !== optionIds.length)
      throw new BadRequestException(
        'One or more selected options are unavailable for this product.',
      );
    for (const link of variant.product.optionGroups) {
      const count = options.filter((option) => option.optionGroupId === link.optionGroupId).length;
      if (count < link.optionGroup.minSelections || count > link.optionGroup.maxSelections)
        throw new BadRequestException(
          `Select between ${link.optionGroup.minSelections} and ${link.optionGroup.maxSelections} options for ${link.optionGroup.name}.`,
        );
    }
    return {
      variant,
      options,
      unitPrice:
        variant.prices[0].amount + options.reduce((sum, option) => sum + option.priceDelta, 0),
    };
  }

  private async category(actor: AuthenticatedUser, id: string) {
    const entity = await this.prisma.category.findUnique({ where: { id } });
    if (!entity) throw new NotFoundException('Category not found.');
    this.assertStore(actor, entity.storeId);
    return entity;
  }
  private async product(actor: AuthenticatedUser, id: string) {
    const entity = await this.prisma.product.findUnique({ where: { id } });
    if (!entity) throw new NotFoundException('Product not found.');
    this.assertStore(actor, entity.storeId);
    return entity;
  }
  private async variant(actor: AuthenticatedUser, id: string) {
    const entity = await this.prisma.productVariant.findUnique({
      where: { id },
      include: { product: true },
    });
    if (!entity) throw new NotFoundException('Variant not found.');
    this.assertStore(actor, entity.product.storeId);
    return entity;
  }
  private async optionGroup(actor: AuthenticatedUser, id: string) {
    const entity = await this.prisma.optionGroup.findUnique({ where: { id } });
    if (!entity) throw new NotFoundException('Option group not found.');
    this.assertStore(actor, entity.storeId);
    return entity;
  }
  private async option(actor: AuthenticatedUser, id: string) {
    const entity = await this.prisma.option.findUnique({ where: { id }, include: { group: true } });
    if (!entity) throw new NotFoundException('Option not found.');
    this.assertStore(actor, entity.group.storeId);
    return entity;
  }
  private async price(actor: AuthenticatedUser, id: string) {
    const entity = await this.prisma.priceSchedule.findUnique({
      where: { id },
      include: { variant: { include: { product: true } } },
    });
    if (!entity) throw new NotFoundException('Price schedule not found.');
    this.assertStore(actor, entity.variant.product.storeId);
    return entity;
  }
  private async categoryForStore(id: string, storeId: string) {
    const entity = await this.prisma.category.findUnique({ where: { id } });
    if (!entity) throw new NotFoundException('Category not found.');
    if (entity.storeId !== storeId)
      throw new ForbiddenException('Category belongs to another store.');
    return entity;
  }
  private assertSelectionBounds(minimum: number, maximum: number) {
    if (minimum > maximum)
      throw new BadRequestException('Minimum selections cannot exceed maximum selections.');
  }
  private date(value: string) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) throw new BadRequestException('Invalid date.');
    return parsed;
  }
  private assertPriceBounds(startsAt: Date, endsAt: Date | null) {
    if (endsAt && endsAt <= startsAt)
      throw new BadRequestException('Price end must be after start.');
  }
  private async assertNoOverlap(
    variantId: string,
    startsAt: Date,
    endsAt: Date | null,
    excludedId?: string,
  ) {
    const overlap = await this.prisma.priceSchedule.findFirst({
      where: {
        variantId,
        id: excludedId ? { not: excludedId } : undefined,
        AND: [
          { startsAt: { lt: endsAt ?? new Date('9999-12-31') } },
          { OR: [{ endsAt: null }, { endsAt: { gt: startsAt } }] },
        ],
      },
    });
    if (overlap) throw new ConflictException('Price schedule overlaps an existing price.');
  }
  private async write<T>(
    operation: () => Promise<T>,
    message = 'A record with the same value already exists.',
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (this.isConstraintError(error)) throw new ConflictException(message);
      throw error;
    }
  }
  private isConstraintError(error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ['P2002', 'P2003', 'P2010'].includes(error.code)
    )
      return true;
    const message =
      typeof error === 'object' && error !== null && 'message' in error
        ? String(error.message)
        : '';
    return message.includes('price_schedule_no_overlap') || message.includes('deadlock detected');
  }
  private assertStore(actor: AuthenticatedUser, storeId: string) {
    if (!actor.isPlatformAdmin && !actor.storeIds.includes(storeId))
      throw new ForbiddenException('Store access denied.');
  }
  private isChainAdmin(actor: AuthenticatedUser) {
    return Boolean(actor.isPlatformAdmin || actor.role === 'ADMIN');
  }
  private async otherStoreIds(excludeStoreId: string) {
    const stores = await this.prisma.store.findMany({
      where: { id: { not: excludeStoreId } },
      select: { id: true },
    });
    return stores.map((s) => s.id);
  }
  private priceSnapshot(schedule: {
    variantId: string;
    amount: number;
    startsAt: Date;
    endsAt: Date | null;
  }) {
    return {
      variantId: schedule.variantId,
      amount: schedule.amount,
      startsAt: schedule.startsAt.toISOString(),
      endsAt: schedule.endsAt?.toISOString() ?? null,
    };
  }
}
