import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CampaignStatus,
  DiningTable,
  FulfillmentStatus,
  OrderSource,
  OrderStatus,
  Prisma,
  ReservationStatus,
  TableStatus,
} from '@prisma/client';
import { PrismaService } from '../co-so-du-lieu/prisma.service.js';
import { CatalogService } from '../thuc-don/catalog.service.js';
import { OrderingService } from '../don-hang/ordering.service.js';
import { EventsService } from '../su-kien/events.service.js';
import { AuditService } from '../nhat-ky-kiem-toan/audit.service.js';
import type { AuthenticatedUser } from '../xac-thuc-phan-quyen/kieu-du-lieu/authenticated-user.js';
import type { CreateTableDto, UpdateTableDto } from './du-lieu-dau-vao/create-table.dto.js';
import type {
  CreateReservationDto,
  PublicReservationDto,
  UpdateReservationStatusDto,
} from './du-lieu-dau-vao/create-reservation.dto.js';
import type { TableSelfOrderDto } from './du-lieu-dau-vao/table-order.dto.js';
import crypto from 'node:crypto';

type DbClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class TablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly ordering: OrderingService,
    private readonly events: EventsService,
    private readonly audit: AuditService,
  ) {}

  // ==================== TABLE MANAGEMENT ====================

  async listTables(actor: AuthenticatedUser, storeId: string) {
    this.assertStore(actor, storeId);
    return this.prisma.diningTable.findMany({
      where: { storeId, isActive: true },
      include: {
        reservations: {
          where: {
            status: { in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED] },
            reservationTime: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) },
          },
          orderBy: { reservationTime: 'asc' },
          take: 3,
        },
        // Current orders of the table (same rule as the customer's QR view) so staff can see
        // what an occupied table has ordered, what is unpaid and the kitchen progress.
        orders: {
          where: this.currentTableOrdersWhere(),
          orderBy: { createdAt: 'desc' },
          select: TablesService.currentTableOrderSelect,
        },
      },
      orderBy: { code: 'asc' },
    });
  }

  private static readonly currentTableOrderSelect = {
    id: true,
    status: true,
    source: true,
    subtotalAmount: true,
    discountAmount: true,
    taxAmount: true,
    totalAmount: true,
    createdAt: true,
    items: {
      select: {
        id: true,
        productName: true,
        variantName: true,
        unitPrice: true,
        quantity: true,
        lineTotal: true,
      },
    },
    fulfillmentTicket: {
      select: {
        status: true,
        queuedAt: true,
        preparingAt: true,
        readyAt: true,
        handedOverAt: true,
      },
    },
  } satisfies Prisma.OrderSelect;

  /**
   * "Current" orders of a table: created within the last 12h, not cancelled/refunded, and either
   * still unpaid, still in the kitchen/serving flow, or handed over within the last 60 minutes.
   */
  private currentTableOrdersWhere(): Prisma.OrderWhereInput {
    const now = Date.now();
    return {
      createdAt: { gte: new Date(now - 12 * 60 * 60 * 1000) },
      status: { in: [OrderStatus.AWAITING_PAYMENT, OrderStatus.PAID] },
      OR: [
        { status: OrderStatus.AWAITING_PAYMENT },
        { fulfillmentTicket: { is: null } },
        {
          fulfillmentTicket: {
            status: {
              in: [
                FulfillmentStatus.QUEUED,
                FulfillmentStatus.PREPARING,
                FulfillmentStatus.READY,
              ],
            },
          },
        },
        {
          fulfillmentTicket: {
            status: FulfillmentStatus.HANDED_OVER,
            handedOverAt: { gte: new Date(now - 60 * 60 * 1000) },
          },
        },
      ],
    };
  }

  async createTable(actor: AuthenticatedUser, dto: CreateTableDto) {
    this.assertStore(actor, dto.storeId);
    const existing = await this.prisma.diningTable.findUnique({
      where: { storeId_code: { storeId: dto.storeId, code: dto.code.trim() } },
    });
    if (existing) throw new ConflictException(`Mã bàn '${dto.code}' đã tồn tại.`);

    const table = await this.prisma.diningTable.create({
      data: {
        storeId: dto.storeId,
        code: dto.code.trim(),
        name: dto.name.trim(),
        capacity: dto.capacity,
        qrCodeToken: crypto.randomUUID(),
      },
    });

    await this.audit.write(this.prisma, {
      storeId: dto.storeId,
      actorId: actor.id,
      action: 'TABLE_CREATED',
      targetType: 'TABLE',
      targetId: table.id,
      metadata: { code: table.code, capacity: table.capacity },
    });

    return table;
  }

  async updateTable(actor: AuthenticatedUser, id: string, dto: UpdateTableDto) {
    const table = await this.prisma.diningTable.findUnique({ where: { id } });
    if (!table) throw new NotFoundException('Bàn không tồn tại.');
    this.assertStore(actor, table.storeId);

    const updated = await this.prisma.diningTable.update({
      where: { id },
      data: {
        code: dto.code?.trim(),
        name: dto.name?.trim(),
        capacity: dto.capacity,
        isActive: dto.isActive,
      },
    });

    await this.audit.write(this.prisma, {
      storeId: table.storeId,
      actorId: actor.id,
      action: 'TABLE_UPDATED',
      targetType: 'TABLE',
      targetId: updated.id,
      metadata: { code: updated.code, capacity: updated.capacity, isActive: updated.isActive },
    });

    return updated;
  }

  async setTableStatus(actor: AuthenticatedUser, id: string, status: TableStatus) {
    if (!Object.values(TableStatus).includes(status)) {
      throw new BadRequestException(
        `Trạng thái bàn '${status}' không hợp lệ. Phải là một trong: ${Object.values(TableStatus).join(', ')}`,
      );
    }
    const table = await this.prisma.diningTable.findUnique({ where: { id } });
    if (!table) throw new NotFoundException('Bàn không tồn tại.');
    this.assertStore(actor, table.storeId);

    // Guard 1: Do not allow changing to AVAILABLE or RESERVED if the table has unpaid orders
    if (status === TableStatus.AVAILABLE || status === TableStatus.RESERVED) {
      const unpaidOrders = await this.prisma.order.findMany({
        where: {
          tableId: id,
          status: OrderStatus.AWAITING_PAYMENT,
        },
        select: { id: true, totalAmount: true },
      });

      if (unpaidOrders.length > 0) {
        const totalUnpaid = unpaidOrders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
        const statusLabel = status === TableStatus.AVAILABLE ? 'Trống' : 'Đã đặt trước';
        throw new BadRequestException(
          `Không thể chuyển bàn ${table.code} sang trạng thái '${statusLabel}'. Bàn đang có ${unpaidOrders.length} hóa đơn chưa thanh toán (tổng ${totalUnpaid.toLocaleString('vi-VN')} đ). Vui lòng hoàn tất thanh toán hoặc hủy đơn trước!`,
        );
      }
    }

    // Guard 2: Do not allow setting to AVAILABLE if there is an active seated reservation
    if (status === TableStatus.AVAILABLE) {
      const activeSeated = await this.prisma.reservation.findFirst({
        where: {
          tableId: id,
          status: ReservationStatus.SEATED,
        },
        select: { id: true, customerName: true },
      });
      if (activeSeated) {
        throw new BadRequestException(
          `Không thể chuyển bàn ${table.code} sang 'Trống' vì khách đặt bàn '${activeSeated.customerName}' đang ngồi dùng bữa (SEATED). Vui lòng hoàn tất lượt đặt bàn trước!`,
        );
      }
    }

    const updated = await this.prisma.diningTable.update({
      where: { id },
      data: { status },
    });

    await this.audit.write(this.prisma, {
      storeId: table.storeId,
      actorId: actor.id,
      action: 'TABLE_STATUS_CHANGED',
      targetType: 'TABLE',
      targetId: updated.id,
      metadata: { code: updated.code, fromStatus: table.status, toStatus: status },
    });

    this.events.emit(table.storeId, 'table.updated', {
      tableId: id,
      code: table.code,
      status,
    });

    return updated;
  }

  async regenerateQrToken(actor: AuthenticatedUser, id: string) {
    const table = await this.prisma.diningTable.findUnique({ where: { id } });
    if (!table) throw new NotFoundException('Bàn không tồn tại.');
    this.assertStore(actor, table.storeId);

    const updated = await this.prisma.diningTable.update({
      where: { id },
      data: { qrCodeToken: crypto.randomUUID() },
    });

    await this.audit.write(this.prisma, {
      storeId: table.storeId,
      actorId: actor.id,
      action: 'TABLE_QR_REGENERATED',
      targetType: 'TABLE',
      targetId: updated.id,
      metadata: { code: updated.code },
    });

    return updated;
  }

  // ==================== RESERVATIONS & ANTI-OVERBOOKING ====================

  async listReservations(actor: AuthenticatedUser, storeId: string, dateStr?: string) {
    this.assertStore(actor, storeId);
    const where: any = { storeId };
    if (dateStr) {
      const startOfDay = new Date(`${dateStr}T00:00:00.000Z`);
      const endOfDay = new Date(`${dateStr}T23:59:59.999Z`);
      where.reservationTime = { gte: startOfDay, lte: endOfDay };
    }
    return this.prisma.reservation.findMany({
      where,
      include: {
        table: true,
      },
      orderBy: { reservationTime: 'asc' },
    });
  }

  async createReservation(actor: AuthenticatedUser, dto: CreateReservationDto) {
    this.assertStore(actor, dto.storeId);
    const resTime = new Date(dto.reservationTime);
    if (resTime.getTime() <= Date.now()) {
      throw new BadRequestException('Thời gian đặt bàn phải ở tương lai.');
    }
    const duration = dto.durationMinutes ?? 90;

    // Date-level lock for transaction advisory lock (serializes booking within store + date to prevent overlapping conflicts)
    const dateKey = resTime.toISOString().slice(0, 10);
    const lockKey = `reservation:${dto.storeId}:${dateKey}`;

    const reservation = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

      // Anti-overbooking check inside serialized transaction
      await this.assertTableCapacityAndAvailability(
        dto.storeId,
        dto.tableId,
        dto.guestCount,
        resTime,
        duration,
        tx,
      );
      if (!dto.tableId) {
        await this.assertStoreCapacityForPublic(dto.storeId, dto.guestCount, resTime, duration, tx);
      }

      const created = await tx.reservation.create({
        data: {
          storeId: dto.storeId,
          tableId: dto.tableId,
          customerName: dto.customerName.trim(),
          customerPhone: dto.customerPhone.trim(),
          customerEmail: dto.customerEmail?.trim() || null,
          guestCount: dto.guestCount,
          reservationTime: resTime,
          durationMinutes: duration,
          status: ReservationStatus.CONFIRMED,
          specialNotes: dto.specialNotes?.trim() || null,
        },
        include: { table: true },
      });

      if (dto.tableId) {
        await tx.diningTable.update({
          where: { id: dto.tableId },
          data: { status: TableStatus.RESERVED },
        });
      }

      await this.audit.write(tx, {
        storeId: dto.storeId,
        actorId: actor.id,
        action: 'RESERVATION_CREATED',
        targetType: 'RESERVATION',
        targetId: created.id,
        metadata: {
          customerName: created.customerName,
          guestCount: created.guestCount,
          reservationTime: created.reservationTime,
          tableId: created.tableId,
        },
      });

      return created;
    });

    if (dto.tableId) {
      this.events.emit(dto.storeId, 'table.updated', {
        tableId: dto.tableId,
        status: TableStatus.RESERVED,
      });
    }

    this.events.emit(dto.storeId, 'reservation.created', {
      reservationId: reservation.id,
      customerName: reservation.customerName,
      guestCount: reservation.guestCount,
      reservationTime: reservation.reservationTime,
    });

    return reservation;
  }

  async updateReservationStatus(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateReservationStatusDto,
  ) {
    const res = await this.prisma.reservation.findUnique({
      where: { id },
      include: { table: true },
    });
    if (!res) throw new NotFoundException('Lịch đặt bàn không tồn tại.');
    this.assertStore(actor, res.storeId);

    // Validate an assignment before entering the write transaction. The same
    // validation is repeated inside the transaction below, where it is protected
    // by the store-day advisory lock.
    if (dto.tableId) {
      const table = await this.prisma.diningTable.findUnique({ where: { id: dto.tableId } });
      if (!table) throw new NotFoundException('Bàn không tồn tại.');
      if (table.storeId !== res.storeId) {
        throw new ForbiddenException('Bàn được chỉ định không thuộc chi nhánh này.');
      }
    }

    // Enforce state machine transitions
    const allowedTransitions: Record<ReservationStatus, ReservationStatus[]> = {
      [ReservationStatus.PENDING]: [ReservationStatus.CONFIRMED, ReservationStatus.CANCELLED],
      [ReservationStatus.CONFIRMED]: [ReservationStatus.SEATED, ReservationStatus.CANCELLED],
      [ReservationStatus.SEATED]: [ReservationStatus.COMPLETED, ReservationStatus.CANCELLED],
      [ReservationStatus.CANCELLED]: [],
      [ReservationStatus.COMPLETED]: [],
    };

    if (res.status !== dto.status) {
      const allowed = allowedTransitions[res.status] || [];
      if (!allowed.includes(dto.status)) {
        throw new BadRequestException(
          `Không thể chuyển trạng thái đặt bàn từ '${res.status}' sang '${dto.status}'.`,
        );
      }
    }

    const oldTableId = res.tableId;
    const targetTableId = dto.tableId ?? res.tableId;

    // Guard: Prevent completing (or cancelling while seated) if the table still has unpaid orders
    if (
      (dto.status === ReservationStatus.COMPLETED ||
        (dto.status === ReservationStatus.CANCELLED && res.status === ReservationStatus.SEATED)) &&
      targetTableId
    ) {
      const unpaidOrders = await this.prisma.order.findMany({
        where: {
          tableId: targetTableId,
          status: OrderStatus.AWAITING_PAYMENT,
        },
        select: { id: true, totalAmount: true },
      });

      if (unpaidOrders.length > 0) {
        const totalUnpaid = unpaidOrders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
        const actionLabel =
          dto.status === ReservationStatus.COMPLETED ? 'hoàn tất' : 'hủy lượt đặt bàn đang ngồi';
        throw new BadRequestException(
          `Không thể ${actionLabel} của khách '${res.customerName}'. Bàn đang có ${unpaidOrders.length} hóa đơn chưa thanh toán (tổng ${totalUnpaid.toLocaleString('vi-VN')} đ). Vui lòng thu tiền hoặc xử lý hóa đơn trước khi đóng bàn!`,
        );
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const dateKey = res.reservationTime.toISOString().slice(0, 10);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`reservation:${res.storeId}:${dateKey}`}))`;
      if (dto.tableId && dto.tableId !== oldTableId) {
        await this.assertTableAssignment(
          tx,
          res.storeId,
          dto.tableId,
          res.id,
          res.guestCount,
          res.reservationTime,
          res.durationMinutes,
        );
      }
      const noteSuffix = dto.note ? ` | [Trạng thái: ${dto.status} - ${dto.note}]` : '';
      const u = await tx.reservation.update({
        where: { id },
        data: {
          status: dto.status,
          tableId: targetTableId,
          specialNotes: noteSuffix ? `${res.specialNotes ?? ''}${noteSuffix}` : undefined,
        },
        include: { table: true },
      });

      // A table's state is derived from all active reservations and unpaid
      // orders, never just the reservation currently being edited.
      if (oldTableId) await this.syncTableStatus(tx, oldTableId);
      if (targetTableId && targetTableId !== oldTableId)
        await this.syncTableStatus(tx, targetTableId);

      await this.audit.write(tx, {
        storeId: res.storeId,
        actorId: actor.id,
        action: 'RESERVATION_STATUS_CHANGED',
        targetType: 'RESERVATION',
        targetId: id,
        metadata: {
          fromStatus: res.status,
          toStatus: dto.status,
          oldTableId: oldTableId ?? null,
          tableId: targetTableId,
          note: dto.note,
        },
      });

      return u;
    });

    const affectedTableIds = [oldTableId, targetTableId].filter((tableId): tableId is string =>
      Boolean(tableId),
    );
    for (const tableId of new Set(affectedTableIds)) {
      const table = await this.prisma.diningTable.findUnique({ where: { id: tableId } });
      if (table)
        this.events.emit(res.storeId, 'table.updated', { tableId: table.id, status: table.status });
    }

    return updated;
  }

  // ==================== PUBLIC BOOKING & AVAILABILITY ====================

  async checkPublicAvailability(storeId: string, dateStr: string, guestCount: number) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      include: {
        tables: { where: { isActive: true } },
      },
    });
    if (!store) throw new NotFoundException('Chi nhánh không tồn tại.');

    const tables = store.tables;
    const totalCapacity = tables.reduce((acc, t) => acc + t.capacity, 0);

    const timeSlots = [
      '10:30',
      '11:00',
      '11:30',
      '12:00',
      '12:30',
      '13:00',
      '13:30',
      '17:00',
      '17:30',
      '18:00',
      '18:30',
      '19:00',
      '19:30',
      '20:00',
      '20:30',
      '21:00',
    ];

    const reservations = await this.prisma.reservation.findMany({
      where: {
        storeId,
        status: {
          in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED, ReservationStatus.SEATED],
        },
        reservationTime: {
          gte: new Date(`${dateStr}T00:00:00.000Z`),
          lte: new Date(`${dateStr}T23:59:59.999Z`),
        },
      },
    });

    const availability = timeSlots.map((timeSlot) => {
      const slotTime = new Date(`${dateStr}T${timeSlot}:00.000Z`);
      const slotEnd = new Date(slotTime.getTime() + 90 * 60 * 1000);

      const overlapping = reservations.filter((r) => {
        const rStart = new Date(r.reservationTime);
        const rEnd = new Date(rStart.getTime() + r.durationMinutes * 60 * 1000);
        return rStart < slotEnd && rEnd > slotTime;
      });

      const bookedGuests = overlapping.reduce((acc, r) => acc + r.guestCount, 0);
      const remainingCapacity = Math.max(0, totalCapacity - bookedGuests);
      const isAvailable = remainingCapacity >= guestCount;

      return {
        time: timeSlot,
        available: isAvailable,
        remainingCapacity,
      };
    });

    return {
      storeId,
      date: dateStr,
      guestCount,
      totalCapacity,
      slots: availability,
    };
  }

  async createPublicReservation(dto: PublicReservationDto) {
    const resTime = new Date(dto.reservationTime);
    if (resTime.getTime() <= Date.now()) {
      throw new BadRequestException('Thời gian đặt bàn phải ở tương lai.');
    }

    // Date-level lock for transaction advisory lock (serializes booking within store + date to prevent overlapping conflicts)
    const dateKey = resTime.toISOString().slice(0, 10);
    const lockKey = `reservation:${dto.storeId}:${dateKey}`;

    const reservation = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

      // Anti-overbook verification inside serialized transaction
      await this.assertStoreCapacityForPublic(dto.storeId, dto.guestCount, resTime, 90, tx);

      // Auto-match best available table if possible
      const availableTable = await this.findBestAvailableTable(
        dto.storeId,
        dto.guestCount,
        resTime,
        90,
        tx,
      );

      const created = await tx.reservation.create({
        data: {
          storeId: dto.storeId,
          tableId: availableTable ? availableTable.id : null,
          customerName: dto.customerName.trim(),
          customerPhone: dto.customerPhone.trim(),
          customerEmail: dto.customerEmail?.trim() || null,
          guestCount: dto.guestCount,
          reservationTime: resTime,
          durationMinutes: 90,
          status: ReservationStatus.CONFIRMED,
          specialNotes: dto.specialNotes?.trim() || null,
        },
        include: { table: true },
      });

      if (availableTable) {
        await tx.diningTable.update({
          where: { id: availableTable.id },
          data: { status: TableStatus.RESERVED },
        });
      }

      await this.audit.write(tx, {
        storeId: dto.storeId,
        actorId: '00000000-0000-0000-0000-000000000000',
        action: 'PUBLIC_RESERVATION_CREATED',
        targetType: 'RESERVATION',
        targetId: created.id,
        metadata: {
          customerName: created.customerName,
          guestCount: created.guestCount,
          reservationTime: created.reservationTime,
          tableCode: availableTable ? availableTable.code : 'Chờ xếp bàn',
        },
      });

      return created;
    });

    if (reservation.tableId) {
      this.events.emit(dto.storeId, 'table.updated', {
        tableId: reservation.tableId,
        status: TableStatus.RESERVED,
      });
    }

    this.events.emit(dto.storeId, 'reservation.created', {
      reservationId: reservation.id,
      customerName: reservation.customerName,
      guestCount: reservation.guestCount,
      reservationTime: reservation.reservationTime,
      tableCode: reservation.table ? reservation.table.code : 'Chờ xếp bàn',
    });

    return {
      success: true,
      reservationId: reservation.id,
      customerName: reservation.customerName,
      guestCount: reservation.guestCount,
      reservationTime: reservation.reservationTime,
      tableCode: reservation.table ? reservation.table.code : null,
      message: 'Đặt bàn thành công! Chick Res rất hân hạnh được phục vụ quý khách.',
    };
  }

  // ==================== TABLE QR SELF-ORDERING ====================

  async getTableForQrOrder(qrToken: string) {
    const table = await this.prisma.diningTable.findUnique({
      where: { qrCodeToken: qrToken },
      include: {
        store: {
          select: {
            id: true,
            name: true,
            address: true,
            phone: true,
          },
        },
      },
    });

    if (!table || !table.isActive) {
      throw new NotFoundException('Mã QR bàn không hợp lệ hoặc bàn đã bị tạm ngừng phục vụ.');
    }

    const storeMember = await this.prisma.storeMember.findFirst({
      where: { storeId: table.storeId },
      orderBy: { createdAt: 'asc' },
    });
    const systemActorId = storeMember?.userId ?? '00000000-0000-0000-0000-000000000000';

    const actor: AuthenticatedUser = {
      id: systemActorId,
      email: 'table-qr@chickres.local',
      role: 'CASHIER' as any,
      isPlatformAdmin: false,
      storeIds: [table.storeId],
      permissions: ['orders.create', 'orders.read', 'catalog.read'],
      authVersion: 1,
      sessionId: crypto.randomUUID(),
    };

    const [categories, activeCampaigns] = await Promise.all([
      this.catalog.menu(actor, table.storeId),
      this.prisma.campaign.findMany({
        where: {
          storeId: table.storeId,
          status: CampaignStatus.PUBLISHED,
        },
        select: {
          id: true,
          name: true,
          discountType: true,
          discountValue: true,
          minOrderAmount: true,
          maxDiscountAmount: true,
        },
      }),
    ]);

    return {
      table: {
        id: table.id,
        code: table.code,
        name: table.name,
        capacity: table.capacity,
        status: table.status,
      },
      store: table.store,
      categories,
      campaigns: activeCampaigns,
    };
  }

  /**
   * Public, read-only view of the current orders of a table (by QR token).
   * "Current" = not cancelled/refunded, created within the last 12h, and either
   * still unpaid, still being prepared/served, or handed over within the last 60 minutes.
   * Only exposes non-sensitive fields (no staff ids, no payment details).
   */
  async getTableCurrentOrders(qrToken: string) {
    const table = await this.prisma.diningTable.findUnique({
      where: { qrCodeToken: qrToken },
      select: { id: true, code: true, isActive: true },
    });
    if (!table || !table.isActive) {
      throw new NotFoundException('Mã QR bàn không hợp lệ.');
    }

    const orders = await this.prisma.order.findMany({
      where: { tableId: table.id, ...this.currentTableOrdersWhere() },
      orderBy: { createdAt: 'desc' },
      select: TablesService.currentTableOrderSelect,
    });

    const unpaidTotal = orders
      .filter((o) => o.status === OrderStatus.AWAITING_PAYMENT)
      .reduce((sum, o) => sum + o.totalAmount, 0);

    return {
      tableCode: table.code,
      orders,
      totalAmount: orders.reduce((sum, o) => sum + o.totalAmount, 0),
      unpaidTotal,
    };
  }

  async createTableSelfOrder(qrToken: string, dto: TableSelfOrderDto, clientProvidedKey?: string) {
    const table = await this.prisma.diningTable.findUnique({
      where: { qrCodeToken: qrToken },
    });

    if (!table || !table.isActive) {
      throw new NotFoundException('Mã QR bàn không hợp lệ.');
    }

    if (dto.items.length === 0) {
      throw new BadRequestException('Vui lòng chọn ít nhất 1 món ăn.');
    }

    const storeAdmin = await this.prisma.storeMember.findFirst({
      where: { storeId: table.storeId },
      orderBy: { createdAt: 'asc' },
    });
    const systemActorId = storeAdmin?.userId ?? '00000000-0000-0000-0000-000000000000';

    const actor: AuthenticatedUser = {
      id: systemActorId,
      email: 'table-qr@chickres.local',
      role: 'CASHIER' as any,
      isPlatformAdmin: false,
      storeIds: [table.storeId],
      permissions: ['orders.create', 'orders.read', 'catalog.read'],
      authVersion: 1,
      sessionId: crypto.randomUUID(),
    };

    // RUN-003: Mandatory client-generated idempotency key (8-128 chars)
    const rawKey = clientProvidedKey || dto.idempotencyKey;
    if (!rawKey || typeof rawKey !== 'string') {
      throw new BadRequestException('Idempotency-Key là bắt buộc đối với đơn đặt tại bàn.');
    }
    const cleanKey = rawKey.trim();
    if (cleanKey.length < 8 || cleanKey.length > 128) {
      throw new BadRequestException('Idempotency-Key phải có độ dài từ 8 đến 128 ký tự.');
    }
    const idempotencyKey = `table-order:${table.id}:${cleanKey}`;

    const order = await this.ordering.create(actor, idempotencyKey, {
      storeId: table.storeId,
      tableId: table.id,
      source: OrderSource.TABLE_QR,
      voucherCode: dto.voucherCode,
      items: dto.items.map((i) => ({
        variantId: i.variantId,
        quantity: i.quantity,
        optionIds: i.optionIds ?? [],
      })),
    });

    // Update table status to occupied
    await this.prisma.diningTable.update({
      where: { id: table.id },
      data: { status: TableStatus.OCCUPIED },
    });

    await this.audit.write(this.prisma, {
      storeId: table.storeId,
      actorId: systemActorId,
      action: 'TABLE_QR_ORDER_CREATED',
      targetType: 'ORDER',
      targetId: order.id,
      metadata: {
        tableCode: table.code,
        totalAmount: order.totalAmount,
        itemsCount: dto.items.length,
        idempotencyKey,
      },
    });

    this.events.emit(table.storeId, 'table.updated', {
      tableId: table.id,
      code: table.code,
      status: TableStatus.OCCUPIED,
    });

    return {
      success: true,
      orderId: order.id,
      totalAmount: order.totalAmount,
      subtotalAmount: order.subtotalAmount,
      discountAmount: order.discountAmount,
      tableCode: table.code,
      itemsCount: order.items.length,
      message: 'Đặt món tại bàn thành công! Đơn hàng đã được chuyển xuống bếp.',
    };
  }

  // ==================== PRIVATE HELPERS ====================

  private async assertTableCapacityAndAvailability(
    storeId: string,
    tableId: string | undefined,
    guestCount: number,
    resTime: Date,
    durationMinutes: number,
    tx: DbClient = this.prisma,
  ) {
    if (tableId) {
      const table = await tx.diningTable.findUnique({ where: { id: tableId } });
      if (!table) throw new NotFoundException('Bàn không tồn tại.');
      if (table.storeId !== storeId) {
        throw new ForbiddenException('Bàn được chỉ định không thuộc chi nhánh này.');
      }
      if (table.capacity < guestCount) {
        throw new BadRequestException(
          `Bàn ${table.code} chỉ chứa tối đa ${table.capacity} khách (yêu cầu: ${guestCount} khách).`,
        );
      }

      const resStartMs = resTime.getTime();
      const resEndMs = resStartMs + durationMinutes * 60 * 1000;
      const dayStart = new Date(resStartMs - 12 * 60 * 60 * 1000);
      const dayEnd = new Date(resStartMs + 12 * 60 * 60 * 1000);

      const candidateReservations = await tx.reservation.findMany({
        where: {
          tableId,
          status: {
            in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED, ReservationStatus.SEATED],
          },
          reservationTime: {
            gte: dayStart,
            lte: dayEnd,
          },
        },
      });

      const conflicting = candidateReservations.find((r) => {
        const rStart = r.reservationTime.getTime();
        const rEnd = rStart + r.durationMinutes * 60 * 1000;
        return rStart < resEndMs && rEnd > resStartMs;
      });

      if (conflicting) {
        throw new ConflictException(`Bàn ${table.code} đã có lịch đặt vào khung giờ này.`);
      }
    }
  }

  private async assertStoreCapacityForPublic(
    storeId: string,
    guestCount: number,
    resTime: Date,
    durationMinutes: number,
    tx: DbClient = this.prisma,
  ) {
    const store = await tx.store.findUnique({
      where: { id: storeId },
      include: { tables: { where: { isActive: true } } },
    });
    if (!store) throw new NotFoundException('Chi nhánh không tồn tại.');

    const totalCapacity = store.tables.reduce((acc, t) => acc + t.capacity, 0);
    const resStartMs = resTime.getTime();
    const resEndMs = resStartMs + durationMinutes * 60 * 1000;
    const dayStart = new Date(resStartMs - 12 * 60 * 60 * 1000);
    const dayEnd = new Date(resStartMs + 12 * 60 * 60 * 1000);

    const candidates = await tx.reservation.findMany({
      where: {
        storeId,
        status: {
          in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED, ReservationStatus.SEATED],
        },
        reservationTime: {
          gte: dayStart,
          lte: dayEnd,
        },
      },
    });

    const overlapping = candidates.filter((r) => {
      const rStart = r.reservationTime.getTime();
      const rEnd = rStart + r.durationMinutes * 60 * 1000;
      return rStart < resEndMs && rEnd > resStartMs;
    });

    const bookedGuests = overlapping.reduce((acc, r) => acc + r.guestCount, 0);
    if (bookedGuests + guestCount > totalCapacity) {
      throw new ConflictException(
        'Khung giờ này nhà hàng đã hết chỗ phục vụ. Quý khách vui lòng chọn khung giờ khác.',
      );
    }
  }

  private async findBestAvailableTable(
    storeId: string,
    guestCount: number,
    resTime: Date,
    durationMinutes: number,
    tx: DbClient = this.prisma,
  ): Promise<DiningTable | null> {
    const tables = await tx.diningTable.findMany({
      where: {
        storeId,
        isActive: true,
        capacity: { gte: guestCount },
      },
      orderBy: { capacity: 'asc' },
    });

    const resStartMs = resTime.getTime();
    const resEndMs = resStartMs + durationMinutes * 60 * 1000;
    const dayStart = new Date(resStartMs - 12 * 60 * 60 * 1000);
    const dayEnd = new Date(resStartMs + 12 * 60 * 60 * 1000);

    const candidates = await tx.reservation.findMany({
      where: {
        storeId,
        status: {
          in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED, ReservationStatus.SEATED],
        },
        reservationTime: {
          gte: dayStart,
          lte: dayEnd,
        },
      },
    });

    for (const table of tables) {
      const hasConflict = candidates.some((r) => {
        if (r.tableId !== table.id) return false;
        const rStart = r.reservationTime.getTime();
        const rEnd = rStart + r.durationMinutes * 60 * 1000;
        return rStart < resEndMs && rEnd > resStartMs;
      });
      if (!hasConflict) return table;
    }
    return null;
  }

  private async assertTableAssignment(
    tx: DbClient,
    storeId: string,
    tableId: string,
    reservationId: string,
    guestCount: number,
    reservationTime: Date,
    durationMinutes: number,
  ) {
    const table = await tx.diningTable.findUnique({ where: { id: tableId } });
    if (!table) throw new NotFoundException('Bàn không tồn tại.');
    if (table.storeId !== storeId) throw new ForbiddenException('Bàn không thuộc chi nhánh này.');
    if (!table.isActive || table.capacity < guestCount)
      throw new BadRequestException('Bàn không còn hoạt động hoặc không đủ sức chứa.');
    const start = reservationTime.getTime();
    const end = start + durationMinutes * 60 * 1000;
    const conflicts = await tx.reservation.findMany({
      where: {
        tableId,
        id: { not: reservationId },
        status: {
          in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED, ReservationStatus.SEATED],
        },
      },
    });
    if (
      conflicts.some((item) => {
        const itemStart = item.reservationTime.getTime();
        const itemEnd = itemStart + item.durationMinutes * 60 * 1000;
        return itemStart < end && itemEnd > start;
      })
    )
      throw new ConflictException(`Bàn ${table.code} đã có lịch đặt trong khung giờ này.`);
  }

  private async syncTableStatus(tx: DbClient, tableId: string) {
    const [activeReservations, unpaidOrders] = await Promise.all([
      tx.reservation.findMany({
        where: {
          tableId,
          status: {
            in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED, ReservationStatus.SEATED],
          },
        },
        select: { status: true },
      }),
      tx.order.count({ where: { tableId, status: OrderStatus.AWAITING_PAYMENT } }),
    ]);
    const status =
      unpaidOrders > 0 ||
      activeReservations.some((reservation) => reservation.status === ReservationStatus.SEATED)
        ? TableStatus.OCCUPIED
        : activeReservations.length > 0
          ? TableStatus.RESERVED
          : TableStatus.AVAILABLE;
    await tx.diningTable.update({ where: { id: tableId }, data: { status } });
  }

  // ==================== PUBLIC RESERVATIONS ====================

  async listPublicStores() {
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

  private assertStore(actor: AuthenticatedUser, storeId: string) {
    if (!actor.isPlatformAdmin && !actor.storeIds.includes(storeId)) {
      throw new ForbiddenException('Store access denied.');
    }
  }
}
