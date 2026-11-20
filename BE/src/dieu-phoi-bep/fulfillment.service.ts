import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FulfillmentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../co-so-du-lieu/prisma.service.js';
import {
  FulfillmentTicketEntity,
  FulfillmentTransitionError,
  type FulfillmentTicketState,
} from '../mien-nghiep-vu/thuc-the/fulfillment-ticket.entity.js';
import { InventoryService } from '../kho-nguyen-lieu/inventory.service.js';
import type { AuthenticatedUser } from '../xac-thuc-phan-quyen/kieu-du-lieu/authenticated-user.js';
import type { TransitionTicketDto } from './du-lieu-dau-vao/transition-ticket.dto.js';

type DbClient = Prisma.TransactionClient | PrismaService;
import { EventsService } from '../su-kien/events.service.js';

const ticketInclude = {
  items: true,
  events: { orderBy: { createdAt: 'asc' } },
  order: { select: { id: true, totalAmount: true, createdAt: true } },
} satisfies Prisma.FulfillmentTicketInclude;

@Injectable()
export class FulfillmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly events: EventsService,
  ) {}

  async createForPaidOrder(tx: DbClient, orderId: string, actorId: string) {
    const existing = await tx.fulfillmentTicket.findUnique({
      where: { orderId },
      include: ticketInclude,
    });
    if (existing) return existing;
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) throw new NotFoundException('Order not found.');
    const products = await tx.product.findMany({
      where: { id: { in: order.items.map((item) => item.productId) }, storeId: order.storeId },
      include: {
        recipeRevisions: {
          where: { isActive: true },
          include: { lines: { include: { ingredient: { select: { name: true } } } } },
        },
      },
    });
    const productById = new Map(products.map((product) => [product.id, product]));
    const created = await tx.fulfillmentTicket.create({
      data: {
        storeId: order.storeId,
        orderId: order.id,
        events: { create: { toStatus: FulfillmentStatus.QUEUED, actorId } },
        items: {
          create: order.items.map((item) => {
            const product = productById.get(item.productId);
            const recipe = product?.recipeRevisions[0];
            return {
              orderItemId: item.id,
              productName: item.productName,
              variantName: item.variantName,
              quantity: item.quantity,
              optionsSnapshot: item.optionsSnapshot as Prisma.InputJsonValue,
              inventoryMode: recipe ? 'TRACKED' : (product?.inventoryMode ?? 'NOT_TRACKED'),
              recipeSnapshot: recipe
                ? {
                    version: recipe.version,
                    productName: product.name,
                    lines: recipe.lines.map((line) => ({
                      ingredientId: line.ingredientId,
                      ingredientName: line.ingredient.name,
                      quantity: line.quantity,
                    })),
                  }
                : Prisma.JsonNull,
            };
          }),
        },
      },
      include: ticketInclude,
    });
    await this.inventory.consumeForFulfillment(tx, created.id, actorId);
    return created;
  }

  /**
   * Refunds are allowed only while a ticket has not entered kitchen work. This
   * runs in the payment transaction: a concurrent move to PREPARING wins over
   * the refund and rolls the payment/order change back without reversing stock.
   */
  async voidForRefund(tx: DbClient, orderId: string, actorId: string, refundNote: string) {
    const note = `Payment refunded: ${refundNote}`;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const ticket = await tx.fulfillmentTicket.findUnique({ where: { orderId } });
      if (!ticket) return null;
      if (ticket.status !== FulfillmentStatus.QUEUED)
        throw new ConflictException(
          'A payment cannot be refunded after kitchen preparation begins.',
        );
      const changed = await tx.fulfillmentTicket.updateMany({
        where: { id: ticket.id, status: FulfillmentStatus.QUEUED },
        data: {
          status: FulfillmentStatus.VOIDED,
          voidedAt: new Date(),
          voidedById: actorId,
          voidReason: note,
        },
      });
      if (changed.count === 1) {
        await this.inventory.reverseConsumptionForRefund(tx, ticket.id, actorId, refundNote);
        await tx.fulfillmentTicketEvent.create({
          data: {
            ticketId: ticket.id,
            fromStatus: ticket.status,
            toStatus: FulfillmentStatus.VOIDED,
            actorId,
            note,
          },
        });
        return tx.fulfillmentTicket.findUniqueOrThrow({
          where: { id: ticket.id },
          include: ticketInclude,
        });
      }
    }
    throw new ConflictException(
      'Ticket changed concurrently; refund was not completed. Retry the refund.',
    );
  }

  async list(actor: AuthenticatedUser, storeId: string, status?: FulfillmentStatus) {
    this.assertStore(actor, storeId);
    return this.prisma.fulfillmentTicket.findMany({
      where: { storeId, ...(status ? { status } : {}) },
      include: ticketInclude,
      orderBy: [{ priority: 'desc' }, { queuedAt: 'asc' }],
      take: 150,
    });
  }

  async get(actor: AuthenticatedUser, ticketId: string) {
    const ticket = await this.prisma.fulfillmentTicket.findUnique({
      where: { id: ticketId },
      include: ticketInclude,
    });
    if (!ticket) throw new NotFoundException('Fulfillment ticket not found.');
    this.assertStore(actor, ticket.storeId);
    return ticket;
  }

  async transition(actor: AuthenticatedUser, ticketId: string, dto: TransitionTicketDto) {
    const ticket = await this.get(actor, ticketId);
    if (ticket.status === dto.status) return ticket;
    this.validateTransition(ticket, dto.status, dto.note);
    const result = await this.prisma.$transaction(async (tx) => {
      const current = await tx.fulfillmentTicket.findUniqueOrThrow({ where: { id: ticketId } });
      if (current.status === dto.status)
        return tx.fulfillmentTicket.findUniqueOrThrow({
          where: { id: ticketId },
          include: ticketInclude,
        });
      this.validateTransition(current, dto.status, dto.note);
      if (dto.status === FulfillmentStatus.PREPARING)
        await this.inventory.consumeForFulfillment(tx, ticketId, actor.id);
      const now = new Date();
      const transitionData = this.transitionData(dto.status, actor.id, now, dto.note);
      const changed = await tx.fulfillmentTicket.updateMany({
        where: { id: ticketId, status: current.status },
        data: { status: dto.status, ...transitionData },
      });
      if (changed.count !== 1)
        throw new ConflictException('Ticket changed concurrently; reload and try again.');
      await tx.fulfillmentTicketEvent.create({
        data: {
          ticketId,
          fromStatus: current.status,
          toStatus: dto.status,
          actorId: actor.id,
          note: dto.note?.trim() || null,
        },
      });
      return tx.fulfillmentTicket.findUniqueOrThrow({
        where: { id: ticketId },
        include: ticketInclude,
      });
    });

    this.events.emit(ticket.storeId, 'ticket.updated', {
      ticketId,
      status: dto.status,
    });

    return result;
  }

  private transitionData(status: FulfillmentStatus, actorId: string, at: Date, note?: string) {
    if (status === FulfillmentStatus.PREPARING) return { preparingAt: at, preparingById: actorId };
    if (status === FulfillmentStatus.READY) return { readyAt: at, readyById: actorId };
    if (status === FulfillmentStatus.HANDED_OVER)
      return { handedOverAt: at, handedOverById: actorId };
    if (status === FulfillmentStatus.VOIDED)
      return { voidedAt: at, voidedById: actorId, voidReason: note?.trim() };
    return {};
  }

  private validateTransition(
    ticket: { id: string; storeId: string; status: FulfillmentStatus },
    next: FulfillmentStatus,
    note?: string,
  ): void {
    try {
      FulfillmentTicketEntity.rehydrate({
        id: ticket.id,
        storeId: ticket.storeId,
        status: ticket.status as FulfillmentTicketState,
      }).transitionTo(next as FulfillmentTicketState, note);
    } catch (error) {
      if (error instanceof FulfillmentTransitionError) {
        if (error.code === 'VOID_REASON_REQUIRED') {
          throw new BadRequestException(error.message);
        }
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  private assertStore(actor: AuthenticatedUser, storeId: string) {
    if (!actor.isPlatformAdmin && !actor.storeIds.includes(storeId))
      throw new ForbiddenException('Store access denied.');
  }
}
