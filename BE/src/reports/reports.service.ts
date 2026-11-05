import { ForbiddenException, Injectable } from '@nestjs/common';
import { OrderStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service.js';
import type { AuthenticatedUser } from '../identity/types/authenticated-user.js';

export type ActivityEvent = {
  id: string;
  action: string;
  entityId: string;
  actorId: string | null;
  occurredAt: Date;
  note: string | null;
};

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async activity(actor: AuthenticatedUser, storeId: string): Promise<ActivityEvent[]> {
    this.assertStore(actor, storeId);
    const [orders, payments, shifts, fulfillment] = await Promise.all([
      this.prisma.order.findMany({
        where: { storeId },
        select: {
          id: true,
          createdById: true,
          createdAt: true,
          cancelledById: true,
          cancelledAt: true,
          cancellationNote: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.payment.findMany({
        where: { storeId },
        select: {
          id: true,
          orderId: true,
          capturedById: true,
          capturedAt: true,
          refundedById: true,
          refundedAt: true,
          refundNote: true,
        },
        orderBy: { capturedAt: 'desc' },
        take: 100,
      }),
      this.prisma.shift.findMany({
        where: { storeId },
        select: {
          id: true,
          openedById: true,
          openedAt: true,
          closedById: true,
          closedAt: true,
          variance: true,
        },
        orderBy: { openedAt: 'desc' },
        take: 100,
      }),
      this.prisma.fulfillmentTicketEvent.findMany({
        where: { ticket: { storeId } },
        select: {
          id: true,
          ticketId: true,
          actorId: true,
          fromStatus: true,
          toStatus: true,
          note: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);
    const events: ActivityEvent[] = [
      ...orders.flatMap((order) => [
        {
          id: `order-created:${order.id}`,
          action: 'ORDER_CREATED',
          entityId: order.id,
          actorId: order.createdById,
          occurredAt: order.createdAt,
          note: null,
        },
        ...(order.cancelledAt
          ? [
              {
                id: `order-cancelled:${order.id}`,
                action: 'ORDER_CANCELLED',
                entityId: order.id,
                actorId: order.cancelledById,
                occurredAt: order.cancelledAt,
                note: order.cancellationNote,
              },
            ]
          : []),
      ]),
      ...payments.flatMap((payment) => [
        {
          id: `payment-captured:${payment.id}`,
          action: 'PAYMENT_CAPTURED',
          entityId: payment.id,
          actorId: payment.capturedById,
          occurredAt: payment.capturedAt,
          note: null,
        },
        ...(payment.refundedAt
          ? [
              {
                id: `payment-refunded:${payment.id}`,
                action: 'PAYMENT_REFUNDED',
                entityId: payment.id,
                actorId: payment.refundedById,
                occurredAt: payment.refundedAt,
                note: payment.refundNote,
              },
            ]
          : []),
      ]),
      ...shifts.flatMap((shift) => [
        {
          id: `shift-opened:${shift.id}`,
          action: 'SHIFT_OPENED',
          entityId: shift.id,
          actorId: shift.openedById,
          occurredAt: shift.openedAt,
          note: null,
        },
        ...(shift.closedAt
          ? [
              {
                id: `shift-closed:${shift.id}`,
                action: 'SHIFT_CLOSED',
                entityId: shift.id,
                actorId: shift.closedById,
                occurredAt: shift.closedAt,
                note: shift.variance != null ? `Chênh lệch: ${shift.variance} đ` : null,
              },
            ]
          : []),
      ]),
      ...fulfillment.map((item) => ({
        id: `ticket-event:${item.id}`,
        action: item.toStatus === 'VOIDED' ? 'TICKET_VOIDED' : 'TICKET_TRANSITIONED',
        entityId: item.ticketId,
        actorId: item.actorId,
        occurredAt: item.createdAt,
        note: item.note,
      })),
    ];
    return events.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime()).slice(0, 100);
  }

  // ==================== SALES REPORT ====================

  async salesReport(actor: AuthenticatedUser, storeId: string, fromStr?: string, toStr?: string) {
    this.assertStore(actor, storeId);
    const dateFilter = this.parseDateFilter(fromStr, toStr);

    const [orders, payments, consumptionEntries] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          storeId,
          status: { in: [OrderStatus.PAID, OrderStatus.REFUNDED] },
          createdAt: dateFilter,
        },
        include: { payments: true },
      }),
      this.prisma.payment.findMany({
        where: {
          storeId,
          capturedAt: dateFilter,
        },
      }),
      this.prisma.inventoryLedgerEntry.findMany({
        where: {
          storeId,
          sourceType: { in: ['FULFILLMENT_TICKET', 'FULFILLMENT_TICKET_REFUND'] },
          occurredAt: dateFilter,
        },
        include: { lot: { select: { unitCost: true } } },
      }),
    ]);

    const paidOrders = orders.filter((o) => o.status === OrderStatus.PAID);
    const totalRevenue = paidOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const totalDiscount = paidOrders.reduce((sum, o) => sum + (o.discountAmount || 0), 0);
    const totalSubtotal = paidOrders.reduce((sum, o) => sum + (o.subtotalAmount || o.totalAmount), 0);

    const _capturedPayments = payments.filter((p) => p.status === PaymentStatus.CAPTURED);
    const refundedPayments = payments.filter((p) => p.status === PaymentStatus.REFUNDED);
    const refundTotal = refundedPayments.reduce((sum, p) => sum + p.amount, 0);
    const netSales = totalRevenue;

    const totalCogs = Math.max(
      0,
      consumptionEntries.reduce((sum, entry) => {
        const unitCost = entry.lot?.unitCost ?? 0;
        // CONSUMPTION entries have negative quantity -> positive COGS; REFUND reversal has positive quantity -> reduces COGS
        return sum + -entry.quantity * unitCost;
      }, 0),
    );
    const grossProfit = netSales - totalCogs;
    const grossMarginPercent =
      netSales > 0 ? Number(((grossProfit / netSales) * 100).toFixed(1)) : 0;
    const consumedTicketsCount = new Set(
      consumptionEntries
        .filter((e) => e.sourceType === 'FULFILLMENT_TICKET' && e.sourceId)
        .map((e) => e.sourceId),
    ).size;

    const paymentMethods = payments
      .filter((p) => p.status === PaymentStatus.CAPTURED)
      .reduce(
        (acc, p) => {
          const method = p.method;
          acc[method] = (acc[method] || 0) + p.amount;
          return acc;
        },
        {} as Record<string, number>,
      );

    const sources = paidOrders.reduce(
      (acc, o) => {
        acc[o.source] = (acc[o.source] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      storeId,
      orderCount: paidOrders.length,
      refundedOrderCount: orders.length - paidOrders.length,
      totalRevenue,
      netSales,
      refundTotal,
      totalDiscount,
      totalSubtotal,
      totalCogs,
      grossProfit,
      grossMarginPercent,
      consumedTicketsCount,
      averageOrderValue: paidOrders.length > 0 ? Math.round(totalRevenue / paidOrders.length) : 0,
      paymentMethods,
      sources,
    };
  }

  // ==================== TOP SELLING PRODUCTS ====================

  async topSelling(
    actor: AuthenticatedUser,
    storeId: string,
    fromStr?: string,
    toStr?: string,
    limit = 10,
  ) {
    this.assertStore(actor, storeId);
    const dateFilter = this.parseDateFilter(fromStr, toStr);

    const orderItems = await this.prisma.orderItem.findMany({
      where: {
        order: {
          storeId,
          status: OrderStatus.PAID,
          createdAt: dateFilter,
        },
      },
      select: {
        productId: true,
        productName: true,
        variantName: true,
        quantity: true,
        lineTotal: true,
      },
    });

    const aggregated = orderItems.reduce(
      (acc, item) => {
        const key = `${item.productId}:${item.variantName}`;
        if (!acc[key]) {
          acc[key] = {
            productId: item.productId,
            name: `${item.productName} (${item.variantName})`,
            quantity: 0,
            revenue: 0,
          };
        }
        acc[key].quantity += item.quantity;
        acc[key].revenue += item.lineTotal;
        return acc;
      },
      {} as Record<string, { productId: string; name: string; quantity: number; revenue: number }>,
    );

    return Object.values(aggregated)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, limit);
  }

  // ==================== SHIFTS & CASH REPORT ====================

  async shiftsReport(actor: AuthenticatedUser, storeId: string, fromStr?: string, toStr?: string) {
    this.assertStore(actor, storeId);
    const dateFilter = this.parseDateFilter(fromStr, toStr);

    const shifts = await this.prisma.shift.findMany({
      where: {
        storeId,
        openedAt: dateFilter,
      },
      include: {
        cashMovements: true,
        payments: true,
      },
      orderBy: { openedAt: 'desc' },
    });

    const totalVariance = shifts.reduce((sum, s) => sum + (s.variance || 0), 0);
    const closedShifts = shifts.filter((s) => s.status === 'CLOSED');

    return {
      storeId,
      totalShifts: shifts.length,
      closedShiftsCount: closedShifts.length,
      totalVariance,
      shifts: shifts.map((s) => ({
        id: s.id,
        openedAt: s.openedAt,
        closedAt: s.closedAt,
        status: s.status,
        openingCash: s.openingCash,
        declaredCash: s.declaredCash,
        expectedCash: s.expectedCash,
        variance: s.variance,
        movementsCount: s.cashMovements.length,
        cashSalesTotal: s.cashMovements
          .filter((m) => m.kind === 'CASH_SALE')
          .reduce((sum, m) => sum + m.amount, 0),
      })),
    };
  }

  // ==================== INVENTORY & WASTE REPORT ====================

  async inventoryWasteReport(
    actor: AuthenticatedUser,
    storeId: string,
    fromStr?: string,
    toStr?: string,
  ) {
    this.assertStore(actor, storeId);
    const dateFilter = this.parseDateFilter(fromStr, toStr);

    const wastes = await this.prisma.inventoryWaste.findMany({
      where: {
        storeId,
        wastedAt: dateFilter,
      },
      include: {
        ingredient: true,
      },
      orderBy: { wastedAt: 'desc' },
    });

    const totalWastedQuantity = wastes.reduce((sum, w) => sum + w.quantity, 0);

    const byReason = wastes.reduce(
      (acc, w) => {
        acc[w.reason] = (acc[w.reason] || 0) + w.quantity;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      storeId,
      totalWastedEntries: wastes.length,
      totalWastedQuantity,
      byReason,
      wastes: wastes.slice(0, 50).map((w) => ({
        id: w.id,
        ingredientName: w.ingredient.name,
        unit: w.ingredient.unit,
        quantity: w.quantity,
        reason: w.reason,
        wastedAt: w.wastedAt,
      })),
    };
  }

  // ==================== DASHBOARD METRICS (REAL SHADCN E-COMMERCE DATA) ====================

  /** Revenue across all stores. This is intentionally a platform-only query. */
  async platformOverview(actor: AuthenticatedUser) {
    if (!actor.isPlatformAdmin)
      throw new ForbiddenException('Platform administrator access is required.');

    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    const paid = { status: OrderStatus.PAID };
    const [current, previous, storeCount] = await Promise.all([
      this.prisma.order.aggregate({
        where: { ...paid, createdAt: { gte: currentMonthStart } },
        _sum: { totalAmount: true },
        _count: { id: true },
      }),
      this.prisma.order.aggregate({
        where: { ...paid, createdAt: { gte: previousMonthStart, lte: previousMonthEnd } },
        _sum: { totalAmount: true },
        _count: { id: true },
      }),
      this.prisma.store.count(),
    ]);
    const currentRevenue = current._sum.totalAmount ?? 0;
    const prevRevenue = previous._sum.totalAmount ?? 0;
    const currentUsers = current._count.id;

    return {
      storeName: `Toàn hệ thống · ${storeCount} cửa hàng`,
      currentRevenue,
      prevRevenue,
      revenueGrowth:
        prevRevenue > 0
          ? Number((((currentRevenue - prevRevenue) / prevRevenue) * 100).toFixed(1))
          : 0,
      currentUsers,
      userGrowth:
        previous._count.id > 0
          ? Number((((currentUsers - previous._count.id) / previous._count.id) * 100).toFixed(1))
          : 0,
      averageOrderValue: currentUsers > 0 ? Math.round(currentRevenue / currentUsers) : 0,
      salesTrend: [],
      revenueBarData: [],
      paymentSourceData: [],
      topItems: [],
    };
  }

  async dashboardMetrics(actor: AuthenticatedUser, storeId: string) {
    this.assertStore(actor, storeId);

    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const [currentOrders, prevOrders, allPayments, store, topItems] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          storeId,
          status: OrderStatus.PAID,
          createdAt: { gte: currentMonthStart },
        },
      }),
      this.prisma.order.findMany({
        where: {
          storeId,
          status: OrderStatus.PAID,
          createdAt: { gte: prevMonthStart, lte: prevMonthEnd },
        },
      }),
      this.prisma.payment.findMany({
        where: {
          storeId,
          status: PaymentStatus.CAPTURED,
        },
      }),
      this.prisma.store.findUnique({
        where: { id: storeId },
        select: { name: true },
      }),
      this.topSelling(actor, storeId, undefined, undefined, 5),
    ]);

    const currentRevenue = currentOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const prevRevenue = prevOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const revenueGrowth =
      prevRevenue > 0
        ? Number((((currentRevenue - prevRevenue) / prevRevenue) * 100).toFixed(1))
        : currentRevenue > 0
          ? 100
          : 0;

    const currentUsers = currentOrders.length;
    const prevUsers = prevOrders.length;
    const userGrowth =
      prevUsers > 0
        ? Number((((currentUsers - prevUsers) / prevUsers) * 100).toFixed(1))
        : currentUsers > 0
          ? 100
          : 0;

    const averageOrderValue = currentUsers > 0 ? Math.round(currentRevenue / currentUsers) : 0;

    // Daily Sales Trend for past 14 days
    const salesTrend = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
      const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
      const dayOrders = await this.prisma.order.findMany({
        where: {
          storeId,
          status: OrderStatus.PAID,
          createdAt: { gte: dayStart, lte: dayEnd },
        },
      });
      const dayRevenue = dayOrders.reduce((sum, o) => sum + o.totalAmount, 0);
      salesTrend.push({
        date: `${d.getDate()}/${d.getMonth() + 1}`,
        revenue: dayRevenue,
        ordersCount: dayOrders.length,
      });
    }

    // Monthly Bar data (past 6 months)
    const monthNames = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const revenueBarData = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mStart = new Date(d.getFullYear(), d.getMonth(), 1);
      const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      const mOrders = await this.prisma.order.findMany({
        where: {
          storeId,
          status: OrderStatus.PAID,
          createdAt: { gte: mStart, lte: mEnd },
        },
      });
      const desktop = mOrders
        .filter((o) => o.source === 'POS')
        .reduce((sum, o) => sum + o.totalAmount, 0);
      const mobile = mOrders
        .filter((o) => o.source !== 'POS')
        .reduce((sum, o) => sum + o.totalAmount, 0);

      revenueBarData.push({
        name: monthNames[d.getMonth()],
        desktop: Math.round(desktop / 1000), // in thousand VND
        mobile: Math.round(mobile / 1000),
      });
    }

    // Payment source breakdown
    const totalPaymentsAmount = allPayments.reduce((sum, p) => sum + p.amount, 0);
    const vietQrAmount = allPayments
      .filter((p) => p.method === PaymentMethod.QR_VIETQR)
      .reduce((sum, p) => sum + p.amount, 0);
    const cashAmount = allPayments
      .filter((p) => p.method === PaymentMethod.CASH)
      .reduce((sum, p) => sum + p.amount, 0);
    const otherAmount = Math.max(0, totalPaymentsAmount - vietQrAmount - cashAmount);

    const paymentSourceData =
      totalPaymentsAmount > 0
        ? [
            {
              name: 'VietQR / Chuyển khoản',
              value: Math.round((vietQrAmount / totalPaymentsAmount) * 100),
              color: '#f59e0b',
            },
            {
              name: 'Tiền mặt tại quầy',
              value: Math.round((cashAmount / totalPaymentsAmount) * 100),
              color: '#334155',
            },
            {
              name: 'Thẻ POS / Ví điện tử',
              value: Math.round((otherAmount / totalPaymentsAmount) * 100),
              color: '#fbbf24',
            },
          ]
        : [];

    return {
      storeName: store?.name ?? 'Chick Res',
      currentRevenue,
      prevRevenue,
      revenueGrowth,
      currentUsers,
      userGrowth,
      averageOrderValue,
      salesTrend,
      revenueBarData,
      paymentSourceData,
      topItems,
    };
  }

  // ==================== CSV EXPORTS ====================

  async exportSalesCsv(
    actor: AuthenticatedUser,
    storeId: string,
    fromStr?: string,
    toStr?: string,
  ): Promise<string> {
    this.assertStore(actor, storeId);
    const dateFilter = this.parseDateFilter(fromStr, toStr);

    const orders = await this.prisma.order.findMany({
      where: {
        storeId,
        createdAt: dateFilter,
      },
      include: {
        table: true,
        payments: true,
        voucherRedemption: { include: { voucher: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const header = [
      'Mã đơn',
      'Thời gian',
      'Kênh bán',
      'Bàn',
      'Tạm tính (đ)',
      'Giảm giá (đ)',
      'Tổng thanh toán (đ)',
      'Mã Voucher',
      'Trạng thái',
      'Phương thức thanh toán',
    ].join(',');
    const rows = orders.map((o) => {
      const methods = o.payments.map((p) => p.method).join('; ') || 'Chưa thanh toán';
      const voucherCode = o.voucherRedemption?.voucher?.code || '';
      const tableCode = o.table?.code || 'Mang đi/Mang về';
      return [
        `"${o.id}"`,
        `"${o.createdAt.toISOString()}"`,
        `"${o.source}"`,
        `"${tableCode}"`,
        o.subtotalAmount || o.totalAmount,
        o.discountAmount || 0,
        o.totalAmount,
        `"${voucherCode}"`,
        `"${o.status}"`,
        `"${methods}"`,
      ].join(',');
    });

    return '\uFEFF' + [header, ...rows].join('\n');
  }

  async exportInventoryCsv(actor: AuthenticatedUser, storeId: string): Promise<string> {
    this.assertStore(actor, storeId);

    const ingredients = await this.prisma.ingredient.findMany({
      where: { storeId },
      include: {
        ledgerEntries: true,
      },
      orderBy: { name: 'asc' },
    });

    const header = [
      'Mã NVL',
      'Tên nguyên liệu',
      'Đơn vị',
      'Tồn kho hiện tại',
      'Định mức tối thiểu',
      'Cảnh báo',
    ].join(',');
    const rows = ingredients.map((ing) => {
      const currentStock = ing.ledgerEntries.reduce((sum, e) => sum + e.quantity, 0);
      const threshold = ing.lowStockQuantity ?? 0;
      const isLow = threshold > 0 && currentStock <= threshold;
      return [
        `"${ing.id}"`,
        `"${ing.name}"`,
        `"${ing.unit}"`,
        currentStock,
        threshold,
        `"${isLow ? 'Cảnh báo sắp hết' : 'Bình thường'}"`,
      ].join(',');
    });

    return '\uFEFF' + [header, ...rows].join('\n');
  }

  private parseDateFilter(fromStr?: string, toStr?: string) {
    if (!fromStr && !toStr) return undefined;
    const filter: { gte?: Date; lte?: Date } = {};
    if (fromStr) filter.gte = new Date(fromStr);
    if (toStr) filter.lte = new Date(toStr);
    return filter;
  }

  private assertStore(actor: AuthenticatedUser, storeId: string) {
    if (!actor.isPlatformAdmin && !actor.storeIds.includes(storeId)) {
      throw new ForbiddenException('Store access denied.');
    }
  }
}
