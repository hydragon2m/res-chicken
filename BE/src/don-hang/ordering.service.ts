import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  IdempotencyScope,
  InventoryPolicy,
  OrderSource,
  OrderStatus,
  Prisma,
  VoucherRedemptionStatus,
} from '@prisma/client';
import { CatalogService } from '../thuc-don/catalog.service.js';
import { AuditService } from '../nhat-ky-kiem-toan/audit.service.js';
import { PrismaService } from '../co-so-du-lieu/prisma.service.js';
import { OrderEntity } from '../mien-nghiep-vu/thuc-the/order.entity.js';
import { EventsService } from '../su-kien/events.service.js';
import { InventoryService } from '../kho-nguyen-lieu/inventory.service.js';
import { PromotionsService } from '../khuyen-mai/promotions.service.js';
import type { AuthenticatedUser } from '../xac-thuc-phan-quyen/kieu-du-lieu/authenticated-user.js';
import type { CreateOrderDto } from './du-lieu-dau-vao/create-order.dto.js';

const orderInclude = {
  items: true,
  payments: { orderBy: { capturedAt: 'asc' } },
  table: true,
  fulfillmentTicket: {
    include: {
      events: { orderBy: { createdAt: 'asc' } },
    },
  },
  voucherRedemption: {
    include: {
      campaign: true,
      voucher: true,
    },
  },
} satisfies Prisma.OrderInclude;

@Injectable()
export class OrderingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
    private readonly promotions: PromotionsService,
  ) {}

  async create(actor: AuthenticatedUser, key: string | undefined, dto: CreateOrderDto) {
    this.assertStore(actor, dto.storeId);
    this.idempotencyKey(key);
    if (dto.items.length === 0) throw new BadRequestException('An order needs at least one item.');
    const existing = await this.prisma.idempotencyRecord.findUnique({
      where: {
        storeId_scope_key: { storeId: dto.storeId, scope: IdempotencyScope.CREATE_ORDER, key },
      },
    });
    if (existing?.orderId) return this.get(actor, existing.orderId);

    const lines = await Promise.all(
      dto.items.map(async (line) => {
        const quote = await this.catalog.sellableVariant(
          dto.storeId,
          line.variantId,
          line.optionIds,
        );
        return {
          productId: quote.variant.productId,
          variantId: quote.variant.id,
          productName: quote.variant.product.name,
          variantName: quote.variant.name,
          unitPrice: quote.unitPrice,
          quantity: line.quantity,
          optionsSnapshot: quote.options.map(({ id, name, priceDelta }) => ({
            id,
            name,
            priceDelta,
          })),
          lineTotal: quote.unitPrice * line.quantity,
          inventoryMode: quote.variant.product.inventoryMode,
        };
      }),
    );
    const storePolicy = await this.prisma.store.findUnique({
      where: { id: dto.storeId },
      select: { inventoryPolicy: true },
    });
    if (!storePolicy) throw new NotFoundException('Store not found.');
    if (storePolicy.inventoryPolicy === InventoryPolicy.STRICT) {
      const untracked = lines.find((line) => line.inventoryMode !== 'TRACKED');
      if (untracked)
        throw new BadRequestException(
          `${untracked.productName} must be inventory-tracked before it can be sold at this store.`,
        );
    }
    const subtotalAmount = lines.reduce((total, line) => total + line.lineTotal, 0);

    try {
      const order = await this.prisma.$transaction(async (tx) => {
        await this.inventory.assertOrderStockAvailable(tx, dto.storeId, lines);
        const store = await tx.store.findUnique({
          where: { id: dto.storeId },
          select: { taxRate: true },
        });
        const validatedVoucher = dto.voucherCode
          ? await this.promotions.validateAndLockVoucher(tx, {
              storeId: dto.storeId,
              code: dto.voucherCode,
              subtotalAmount,
            })
          : null;
        const discountAmount = validatedVoucher?.discountAmount ?? 0;
        const taxableAmount = Math.max(0, subtotalAmount - discountAmount);
        const taxRate = store?.taxRate ?? 0;
        const taxAmount = Math.round(taxableAmount * taxRate);
        const totalAmount = taxableAmount + taxAmount;
        const created = await tx.order.create({
          data: {
            storeId: dto.storeId,
            createdById: actor.id,
            subtotalAmount,
            discountAmount,
            taxRate,
            taxAmount,
            totalAmount,
            tableId: dto.tableId,
            source: dto.source ?? OrderSource.POS,
            items: {
              create: lines.map(({ inventoryMode: _inventoryMode, ...line }) => line),
            },
            ...(validatedVoucher
              ? {
                  voucherRedemption: {
                    create: {
                      storeId: dto.storeId,
                      campaignId: validatedVoucher.campaignId,
                      voucherId: validatedVoucher.voucherId,
                      discountAmount,
                      status: VoucherRedemptionStatus.RESERVED,
                    },
                  },
                }
              : {}),
          },
          include: orderInclude,
        });
        await tx.idempotencyRecord.create({
          data: {
            storeId: dto.storeId,
            scope: IdempotencyScope.CREATE_ORDER,
            key,
            orderId: created.id,
          },
        });
        if (dto.tableId) {
          await tx.diningTable.updateMany({
            where: { id: dto.tableId, storeId: dto.storeId },
            data: { status: 'OCCUPIED' },
          });
        }
        await this.audit.write(tx, {
          storeId: dto.storeId,
          actorId: actor.id,
          action: 'ORDER_CREATED',
          targetType: 'ORDER',
          targetId: created.id,
          metadata: {
            totalAmount: created.totalAmount,
            subtotalAmount: created.subtotalAmount,
            discountAmount: created.discountAmount,
            taxAmount: created.taxAmount,
            taxRate: created.taxRate,
            itemCount: created.items.length,
            tableId: created.tableId,
            source: created.source,
          },
        });
        return created;
      });

      this.events.emit(dto.storeId, 'order.created', {
        orderId: order.id,
        totalAmount: order.totalAmount,
        source: order.source,
        tableId: order.tableId,
      });

      return order;
    } catch (error) {
      if (this.isUnique(error)) {
        const replay = await this.prisma.idempotencyRecord.findUnique({
          where: {
            storeId_scope_key: { storeId: dto.storeId, scope: IdempotencyScope.CREATE_ORDER, key },
          },
        });
        if (replay?.orderId) return this.get(actor, replay.orderId);
      }
      throw error;
    }
  }

  async list(actor: AuthenticatedUser, storeId: string) {
    this.assertStore(actor, storeId);
    return this.prisma.order.findMany({
      where: { storeId },
      include: orderInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
  async get(actor: AuthenticatedUser, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: orderInclude,
    });
    if (!order) throw new NotFoundException('Order not found.');
    this.assertStore(actor, order.storeId);
    return order;
  }
  async cancel(actor: AuthenticatedUser, key: string | undefined, orderId: string, note: string) {
    this.idempotencyKey(key);
    const order = await this.get(actor, orderId);
    if (!OrderEntity.rehydrate(order).canBeCancelled()) {
      throw new BadRequestException('Only an unpaid order can be cancelled.');
    }
    const existing = await this.prisma.idempotencyRecord.findUnique({
      where: {
        storeId_scope_key: { storeId: order.storeId, scope: IdempotencyScope.CANCEL_ORDER, key },
      },
    });
    if (existing?.orderId) return this.get(actor, existing.orderId);
    try {
      await this.prisma.$transaction(async (tx) => {
        const cancelled = await tx.order.updateMany({
          where: { id: order.id, status: OrderStatus.AWAITING_PAYMENT },
          data: {
            status: OrderStatus.CANCELLED,
            cancelledById: actor.id,
            cancelledAt: new Date(),
            cancellationNote: note,
          },
        });
        if (cancelled.count !== 1)
          throw new BadRequestException('Only an unpaid order can be cancelled.');
        await tx.idempotencyRecord.create({
          data: {
            storeId: order.storeId,
            scope: IdempotencyScope.CANCEL_ORDER,
            key,
            orderId: order.id,
          },
        });
        if (order.voucherRedemption?.status === VoucherRedemptionStatus.RESERVED) {
          await tx.voucherRedemption.update({
            where: { id: order.voucherRedemption.id },
            data: {
              status: VoucherRedemptionStatus.RELEASED,
              releasedAt: new Date(),
              releaseReason: note,
            },
          });
        }
        await this.audit.write(tx, {
          storeId: order.storeId,
          actorId: actor.id,
          action: 'ORDER_CANCELLED',
          targetType: 'ORDER',
          targetId: order.id,
          metadata: { note },
        });
      });

      this.events.emit(order.storeId, 'order.cancelled', { orderId: order.id });
      return this.get(actor, order.id);
    } catch (error) {
      if (this.isUnique(error)) {
        const replay = await this.prisma.idempotencyRecord.findUnique({
          where: {
            storeId_scope_key: {
              storeId: order.storeId,
              scope: IdempotencyScope.CANCEL_ORDER,
              key,
            },
          },
        });
        if (replay?.orderId) return this.get(actor, replay.orderId);
      }
      throw error;
    }
  }
  private idempotencyKey(key: string | undefined): asserts key is string {
    if (!key?.trim() || key.length > 200)
      throw new BadRequestException('Idempotency-Key header is required.');
  }
  private assertStore(actor: AuthenticatedUser, storeId: string) {
    if (!actor.isPlatformAdmin && !actor.storeIds.includes(storeId))
      throw new ForbiddenException('Store access denied.');
  }
  private isUnique(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
