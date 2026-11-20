import { ForbiddenException, Injectable } from '@nestjs/common';
import { OrderStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../co-so-du-lieu/prisma.service.js';
import type { AuthenticatedUser } from '../xac-thuc-phan-quyen/kieu-du-lieu/authenticated-user.js';

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

  async dashboardMetrics(actor: AuthenticatedUser, storeId: string, range = '30d') {
    this.assertStore(actor, storeId);

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
      // default: 30d
      currentStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const durationMs = Math.max(24 * 60 * 60 * 1000, currentEnd.getTime() - currentStart.getTime());
    const prevStart = new Date(currentStart.getTime() - durationMs);
    const prevEnd = new Date(currentStart.getTime() - 1);

    // Date for 6-month historical monthly trend
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [currentOrders, prevOrders, allPayments, store, products, consumptionEntries, sixMonthsOrders] =
      await Promise.all([
        this.prisma.order.findMany({
          where: {
            storeId,
            status: OrderStatus.PAID,
            createdAt: { gte: currentStart, lte: currentEnd },
          },
          include: {
            items: true,
            payments: true,
          },
        }),
        this.prisma.order.findMany({
          where: {
            storeId,
            status: OrderStatus.PAID,
            createdAt: { gte: prevStart, lte: prevEnd },
          },
          select: { totalAmount: true },
        }),
        this.prisma.payment.findMany({
          where: {
            storeId,
            status: PaymentStatus.CAPTURED,
            capturedAt: { gte: currentStart, lte: currentEnd },
          },
        }),
        this.prisma.store.findUnique({
          where: { id: storeId },
          select: { name: true },
        }),
        this.prisma.product.findMany({
          where: { storeId },
          select: {
            id: true,
            name: true,
            category: { select: { id: true, name: true } },
          },
        }),
        this.prisma.inventoryLedgerEntry.findMany({
          where: {
            storeId,
            sourceType: { in: ['FULFILLMENT_TICKET', 'FULFILLMENT_TICKET_REFUND'] },
            occurredAt: { gte: currentStart, lte: currentEnd },
          },
          include: { lot: { select: { unitCost: true } } },
        }),
        this.prisma.order.findMany({
          where: {
            storeId,
            status: OrderStatus.PAID,
            createdAt: { gte: sixMonthsAgo, lte: currentEnd },
          },
          select: {
            createdAt: true,
            source: true,
            totalAmount: true,
          },
        }),
      ]);

    const productCategoryMap = new Map<string, string>();
    for (const p of products) {
      productCategoryMap.set(p.id, p.category?.name || 'Khác');
    }

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
    const prevAov = prevUsers > 0 ? Math.round(prevRevenue / prevUsers) : 0;
    const aovGrowth =
      prevAov > 0
        ? Number((((averageOrderValue - prevAov) / prevAov) * 100).toFixed(1))
        : averageOrderValue > 0
          ? 100
          : 0;

    // 1. COGS & Profitability
    const totalCogs = Math.max(
      0,
      consumptionEntries.reduce((sum, entry) => {
        const unitCost = entry.lot?.unitCost ?? 0;
        return sum + -entry.quantity * unitCost;
      }, 0),
    );
    const grossProfit = currentRevenue - totalCogs;
    const grossMarginPercent =
      currentRevenue > 0 ? Number(((grossProfit / currentRevenue) * 100).toFixed(1)) : 0;

    // 2. Hourly Sales & Peak Hour Analysis (24h)
    const hourlyBuckets = Array.from({ length: 24 }, (_, h) => ({
      hour: `${h.toString().padStart(2, '0')}:00`,
      hourNum: h,
      orders: 0,
      revenue: 0,
    }));

    for (const order of currentOrders) {
      const h = new Date(order.createdAt).getHours();
      if (h >= 0 && h < 24) {
        hourlyBuckets[h].orders += 1;
        hourlyBuckets[h].revenue += order.totalAmount;
      }
    }

    let peakHourBucket = hourlyBuckets[12];
    for (const b of hourlyBuckets) {
      if (b.revenue > peakHourBucket.revenue) {
        peakHourBucket = b;
      }
    }
    const peakHour = `${peakHourBucket.hour} - ${(peakHourBucket.hourNum + 1).toString().padStart(2, '0')}:00`;

    // Dayparts (Sáng, Trưa, Chiều, Tối, Đêm)
    const dayparts = [
      { name: 'Sáng (06h - 11h)', orders: 0, revenue: 0, percent: 0 },
      { name: 'Trưa (11h - 14h)', orders: 0, revenue: 0, percent: 0 },
      { name: 'Chiều (14h - 17h)', orders: 0, revenue: 0, percent: 0 },
      { name: 'Tối (17h - 21h)', orders: 0, revenue: 0, percent: 0 },
      { name: 'Đêm (21h - 06h)', orders: 0, revenue: 0, percent: 0 },
    ];
    for (const b of hourlyBuckets) {
      if (b.hourNum >= 6 && b.hourNum < 11) {
        dayparts[0].orders += b.orders;
        dayparts[0].revenue += b.revenue;
      } else if (b.hourNum >= 11 && b.hourNum < 14) {
        dayparts[1].orders += b.orders;
        dayparts[1].revenue += b.revenue;
      } else if (b.hourNum >= 14 && b.hourNum < 17) {
        dayparts[2].orders += b.orders;
        dayparts[2].revenue += b.revenue;
      } else if (b.hourNum >= 17 && b.hourNum < 21) {
        dayparts[3].orders += b.orders;
        dayparts[3].revenue += b.revenue;
      } else {
        dayparts[4].orders += b.orders;
        dayparts[4].revenue += b.revenue;
      }
    }
    for (const dp of dayparts) {
      dp.percent = currentRevenue > 0 ? Number(((dp.revenue / currentRevenue) * 100).toFixed(1)) : 0;
    }

    // 3. Category Breakdown (Market Product Mix)
    const categoryAgg: Record<string, { category: string; quantity: number; revenue: number }> = {};
    for (const order of currentOrders) {
      for (const item of order.items) {
        const catName = productCategoryMap.get(item.productId) || 'Món khác';
        if (!categoryAgg[catName]) {
          categoryAgg[catName] = { category: catName, quantity: 0, revenue: 0 };
        }
        categoryAgg[catName].quantity += item.quantity;
        categoryAgg[catName].revenue += item.lineTotal;
      }
    }
    const categoryDistribution = Object.values(categoryAgg)
      .map((c) => ({
        ...c,
        percent: currentRevenue > 0 ? Number(((c.revenue / currentRevenue) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // 4. Channel Comparison: POS vs TABLE_QR
    const posOrders = currentOrders.filter((o) => o.source === 'POS');
    const qrOrders = currentOrders.filter((o) => o.source !== 'POS');
    const posRevenue = posOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const qrRevenue = qrOrders.reduce((sum, o) => sum + o.totalAmount, 0);

    const channelComparison = {
      pos: {
        ordersCount: posOrders.length,
        revenue: posRevenue,
        aov: posOrders.length > 0 ? Math.round(posRevenue / posOrders.length) : 0,
        sharePercent: currentRevenue > 0 ? Number(((posRevenue / currentRevenue) * 100).toFixed(1)) : 0,
      },
      tableQr: {
        ordersCount: qrOrders.length,
        revenue: qrRevenue,
        aov: qrOrders.length > 0 ? Math.round(qrRevenue / qrOrders.length) : 0,
        sharePercent: currentRevenue > 0 ? Number(((qrRevenue / currentRevenue) * 100).toFixed(1)) : 0,
      },
    };

    // 5. Order Ticket Size Brackets (Thị phần mức chi tiêu)
    const orderBrackets = [
      { key: '<60k', label: 'Dưới 60k (Ăn vặt / Đồ uống)', count: 0, revenue: 0, percent: 0 },
      { key: '60k-120k', label: '60k - 120k (Suất đơn)', count: 0, revenue: 0, percent: 0 },
      { key: '120k-250k', label: '120k - 250k (Combo 2 người)', count: 0, revenue: 0, percent: 0 },
      { key: '>250k', label: 'Trên 250k (Nhóm bạn / Gia đình)', count: 0, revenue: 0, percent: 0 },
    ];
    for (const o of currentOrders) {
      if (o.totalAmount < 60000) {
        orderBrackets[0].count += 1;
        orderBrackets[0].revenue += o.totalAmount;
      } else if (o.totalAmount <= 120000) {
        orderBrackets[1].count += 1;
        orderBrackets[1].revenue += o.totalAmount;
      } else if (o.totalAmount <= 250000) {
        orderBrackets[2].count += 1;
        orderBrackets[2].revenue += o.totalAmount;
      } else {
        orderBrackets[3].count += 1;
        orderBrackets[3].revenue += o.totalAmount;
      }
    }
    for (const ob of orderBrackets) {
      ob.percent = currentUsers > 0 ? Number(((ob.count / currentUsers) * 100).toFixed(1)) : 0;
    }

    // 6. Daily Sales Trend across the selected range
    const daysCount = Math.min(30, Math.max(1, Math.ceil(durationMs / (24 * 60 * 60 * 1000))));
    const salesTrendMap: Record<string, { date: string; revenue: number; ordersCount: number }> = {};
    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date(currentEnd.getTime() - i * 24 * 60 * 60 * 1000);
      const key = `${d.getDate()}/${d.getMonth() + 1}`;
      salesTrendMap[key] = { date: key, revenue: 0, ordersCount: 0 };
    }
    for (const o of currentOrders) {
      const d = new Date(o.createdAt);
      const key = `${d.getDate()}/${d.getMonth() + 1}`;
      if (salesTrendMap[key]) {
        salesTrendMap[key].revenue += o.totalAmount;
        salesTrendMap[key].ordersCount += 1;
      }
    }
    const salesTrend = Object.values(salesTrendMap);

    // 7. Monthly Bar data (past 6 months)
    const monthNames = [
      'Th 1',
      'Th 2',
      'Th 3',
      'Th 4',
      'Th 5',
      'Th 6',
      'Th 7',
      'Th 8',
      'Th 9',
      'Th 10',
      'Th 11',
      'Th 12',
    ];
    const revenueBarData = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mStart = new Date(d.getFullYear(), d.getMonth(), 1);
      const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      const mOrders = sixMonthsOrders.filter((o) => {
        const t = new Date(o.createdAt).getTime();
        return t >= mStart.getTime() && t <= mEnd.getTime();
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

    // 8. Payment source breakdown
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
              amount: vietQrAmount,
              color: '#f59e0b',
            },
            {
              name: 'Tiền mặt tại quầy',
              value: Math.round((cashAmount / totalPaymentsAmount) * 100),
              amount: cashAmount,
              color: '#334155',
            },
            {
              name: 'Thẻ POS / Khác',
              value: Math.round((otherAmount / totalPaymentsAmount) * 100),
              amount: otherAmount,
              color: '#fbbf24',
            },
          ]
        : [];

    // 9. Top 8 Selling Items with Market Contribution Rate
    const itemAgg: Record<string, { productId: string; name: string; quantity: number; revenue: number }> = {};
    for (const order of currentOrders) {
      for (const item of order.items) {
        const key = `${item.productId}:${item.variantName}`;
        if (!itemAgg[key]) {
          itemAgg[key] = {
            productId: item.productId,
            name: `${item.productName} (${item.variantName})`,
            quantity: 0,
            revenue: 0,
          };
        }
        itemAgg[key].quantity += item.quantity;
        itemAgg[key].revenue += item.lineTotal;
      }
    }
    const topItems = Object.values(itemAgg)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 8)
      .map((it) => ({
        ...it,
        contributionPercent:
          currentRevenue > 0 ? Number(((it.revenue / currentRevenue) * 100).toFixed(1)) : 0,
      }));

    return {
      storeName: store?.name ?? 'Chick Res',
      range,
      currentRevenue,
      prevRevenue,
      revenueGrowth,
      currentUsers,
      prevUsers,
      userGrowth,
      averageOrderValue,
      aovGrowth,
      profitability: {
        revenue: currentRevenue,
        totalCogs,
        grossProfit,
        grossMarginPercent,
      },
      peakHour,
      hourlyDistribution: hourlyBuckets.filter((h) => h.hourNum >= 7 && h.hourNum <= 22),
      dayparts,
      categoryDistribution,
      channelComparison,
      orderBrackets,
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
