'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, useMemo } from 'react';
import {
  Receipt,
  Search,
  RefreshCw,
  Printer,
  RotateCcw,
  Ban,
  Store,
  CreditCard,
  Banknote,
  QrCode,
  CheckCircle2,
  Clock,
  ChefHat,
  BellRing,
  PackageCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { AccessDenied } from '@/thanh-phan/access-denied';
import { ApiError, apiRequest, getActor, type Actor } from '@/thu-vien/auth';
import { printOrderReceipt, printRefundReceipt } from '@/thu-vien/print-receipt';
import { useActiveStore } from '@/thu-vien/store-context';
import { Button } from '@/thanh-phan/giao-dien/button';
import { Input } from '@/thanh-phan/giao-dien/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/thanh-phan/giao-dien/dialog';

type FulfillmentStatusKey = 'QUEUED' | 'PREPARING' | 'READY' | 'HANDED_OVER' | 'VOIDED';

type FulfillmentTicket = {
  id: string;
  status: FulfillmentStatusKey;
  queuedAt: string;
  preparingAt?: string | null;
  readyAt?: string | null;
  handedOverAt?: string | null;
  voidedAt?: string | null;
  voidReason?: string | null;
  events?: {
    id: string;
    fromStatus?: FulfillmentStatusKey | null;
    toStatus: FulfillmentStatusKey;
    note?: string | null;
    createdAt: string;
  }[];
};

type Order = {
  id: string;
  source?: 'POS' | 'TABLE_QR' | 'QR' | string;
  status: 'AWAITING_PAYMENT' | 'PAID' | 'REFUNDED' | 'CANCELLED' | string;
  subtotalAmount?: number;
  discountAmount?: number;
  totalAmount: number;
  voucherCode?: string | null;
  note?: string | null;
  cancellationNote?: string | null;
  createdAt: string;
  updatedAt?: string;
  table?: { id: string; code: string; name: string } | null;
  diningTable?: { id: string; code: string; name: string } | null;
  fulfillmentTicket?: FulfillmentTicket | null;
  items: {
    id: string;
    productName: string;
    variantName: string;
    quantity: number;
    lineTotal: number;
    optionsSnapshot: { name: string }[];
  }[];
  payments: {
    id: string;
    method: string;
    amount: number;
    status: string;
    refundedAt?: string | null;
    refundNote?: string | null;
  }[];
};

const money = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

const statusMap: Record<
  string,
  {
    label: string;
    badgeVariant: 'default' | 'secondary' | 'outline' | 'destructive';
    colorClass: string;
  }
> = {
  AWAITING_PAYMENT: {
    label: 'Chờ thu tiền',
    badgeVariant: 'outline',
    colorClass: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  PAID: {
    label: 'Đã thanh toán',
    badgeVariant: 'default',
    colorClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  REFUNDED: {
    label: 'Đã hoàn tiền',
    badgeVariant: 'secondary',
    colorClass: 'bg-blue-50 text-blue-800 border-blue-200',
  },
  CANCELLED: {
    label: 'Đã huỷ',
    badgeVariant: 'destructive',
    colorClass: 'bg-rose-50 text-rose-800 border-rose-200',
  },
};

const fulfillmentStatusMap: Record<
  FulfillmentStatusKey | 'UNPAID',
  {
    label: string;
    shortLabel: string;
    colorClass: string;
    nextStatus?: FulfillmentStatusKey;
    nextActionLabel?: string;
  }
> = {
  UNPAID: {
    label: 'Chưa gửi bếp',
    shortLabel: 'Chưa gửi bếp',
    colorClass: 'bg-slate-100 text-slate-600 border-slate-200',
  },
  QUEUED: {
    label: 'Chưa nhận / Chờ bếp làm',
    shortLabel: 'Chưa nhận (Chờ làm)',
    colorClass: 'bg-amber-50 text-amber-800 border-amber-300',
    nextStatus: 'PREPARING',
    nextActionLabel: 'Nhận & Bắt đầu làm',
  },
  PREPARING: {
    label: 'Đang làm (Bếp chế biến)',
    shortLabel: 'Đang làm',
    colorClass: 'bg-sky-50 text-sky-800 border-sky-300',
    nextStatus: 'READY',
    nextActionLabel: 'Báo xong / Đang giao',
  },
  READY: {
    label: 'Đang giao / Chờ trả khách',
    shortLabel: 'Đang giao / Chờ lấy',
    colorClass: 'bg-indigo-50 text-indigo-800 border-indigo-300',
    nextStatus: 'HANDED_OVER',
    nextActionLabel: 'Xác nhận Đã giao khách',
  },
  HANDED_OVER: {
    label: 'Đã giao cho khách',
    shortLabel: 'Đã giao xong',
    colorClass: 'bg-emerald-50 text-emerald-800 border-emerald-300',
  },
  VOIDED: {
    label: 'Đã huỷ chế biến',
    shortLabel: 'Đã huỷ bếp',
    colorClass: 'bg-rose-50 text-rose-700 border-rose-200',
  },
};

const FULFILLMENT_STEPS: {
  key: FulfillmentStatusKey;
  title: string;
  subtitle: string;
}[] = [
  { key: 'QUEUED', title: '1. Chưa nhận', subtitle: 'Chờ bếp tiếp nhận' },
  { key: 'PREPARING', title: '2. Đang làm', subtitle: 'Bếp đang chế biến' },
  { key: 'READY', title: '3. Đang giao', subtitle: 'Món xong • Chờ giao' },
  { key: 'HANDED_OVER', title: '4. Đã giao', subtitle: 'Khách đã nhận món' },
];

export default function OrdersPage() {
  const router = useRouter();
  const { currentStoreId: storeId, currentStore } = useActiveStore();
  const [actor, setActor] = useState<Actor | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selected, setSelected] = useState<Order | null>(null);
  const [filter, setFilter] = useState<string>('ALL');
  const [fulfillmentFilter, setFulfillmentFilter] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');
  const [busy, setBusy] = useState(false);

  // Dialogs
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [refundReason, setRefundReason] = useState('');
  const [refundMethod, setRefundMethod] = useState<'CASH' | 'ORIGINAL'>('CASH');

  const load = useCallback(async (id: string) => {
    if (!id) return;
    try {
      const list = await apiRequest<Order[]>(`/orders?storeId=${encodeURIComponent(id)}`);
      setOrders(list);
      setSelected((current) => list.find((item) => item.id === current?.id) ?? list[0] ?? null);
    } catch {
      toast.error('Không thể tải danh sách đơn hàng.');
    }
  }, []);

  useEffect(() => {
    void getActor()
      .then(setActor)
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) router.replace('/login');
      });
  }, [router]);

  useEffect(() => {
    if (!storeId || !actor?.permissions.includes('orders.read')) return;
    void load(storeId);
  }, [storeId, actor, load]);

  useEffect(() => {
    if (!storeId || !actor?.permissions.includes('orders.read')) return;
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    let es: EventSource | null = null;
    let isCancelled = false;

    void (async () => {
      try {
        const { ticket } = await apiRequest<{ ticket: string }>('/events/ticket', {
          method: 'POST',
        });
        if (isCancelled) return;
        es = new EventSource(
          `${baseUrl}/api/v1/events/stream?storeId=${storeId}&ticket=${encodeURIComponent(ticket)}`,
        );
        const reload = () => {
          void load(storeId);
        };
        es.addEventListener('order.created', reload);
        es.addEventListener('order.paid', reload);
        es.addEventListener('order.cancelled', reload);
        es.addEventListener('ticket.updated', reload);
      } catch {
        // Ignore SSE connection error
      }
    })();

    return () => {
      isCancelled = true;
      if (es) es.close();
    };
  }, [storeId, actor, load]);

  const handleCaptureCash = async (order: Order) => {
    setBusy(true);
    try {
      await apiRequest(`/orders/${order.id}/payments`, {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({
          method: 'CASH',
          amount: order.totalAmount,
        }),
      });
      await load(storeId);
      toast.success(
        `Đã thu tiền mặt ${money.format(order.totalAmount)} cho đơn #${order.id.slice(0, 8).toUpperCase()}`,
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Không thể thu tiền đơn hàng (Kiểm tra ca thu ngân).',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!selected) return;
    if (!cancelReason.trim()) {
      toast.warning('Vui lòng nhập lý do huỷ đơn.');
      return;
    }
    setBusy(true);
    try {
      await apiRequest<Order>(`/orders/${selected.id}/cancel`, {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ note: cancelReason.trim() }),
      });
      await load(storeId);
      setCancelDialogOpen(false);
      setCancelReason('');
      toast.success('Đã huỷ đơn hàng thành công.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể huỷ đơn.');
    } finally {
      setBusy(false);
    }
  };

  const handleRefundOrder = async () => {
    if (!selected) return;
    const payment = selected.payments[0];
    if (!payment) {
      toast.error('Đơn hàng không có dữ liệu thanh toán để hoàn tiền.');
      return;
    }
    if (!refundReason.trim()) {
      toast.warning('Vui lòng nhập lý do huỷ & hoàn tiền.');
      return;
    }
    setBusy(true);
    try {
      await apiRequest<{ order: Order }>(`/payments/${payment.id}/refund`, {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({
          note: refundReason.trim(),
          refundMethod: refundMethod === 'CASH' ? 'CASH' : undefined,
        }),
      });
      await load(storeId);
      setRefundDialogOpen(false);
      toast.success(
        refundMethod === 'CASH'
          ? `Đã hoàn trả ${money.format(selected.totalAmount)} tiền mặt cho khách.`
          : 'Đã hoàn tiền đơn hàng thành công.',
      );

      // In phiếu hoàn tiền mặt
      printRefundReceipt({
        id: selected.id,
        orderCreatedAt: selected.createdAt,
        refundedAt: new Date().toISOString(),
        tableCode: (selected.table ?? selected.diningTable)?.code ?? null,
        source: selected.source,
        totalAmount: selected.totalAmount,
        refundMethod: refundMethod === 'CASH' ? 'Tiền mặt (Chi từ ca)' : 'Theo phương thức gốc',
        refundReason: refundReason.trim(),
        storeName: currentStore?.name,
        items: selected.items.map((it) => ({
          productName: it.productName,
          variantName: it.variantName,
          quantity: it.quantity,
          lineTotal: it.lineTotal,
        })),
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể hoàn tiền.');
    } finally {
      setBusy(false);
    }
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchFilter = filter === 'ALL' || order.status === filter;
      const ticketStatus = order.fulfillmentTicket?.status ?? 'UNPAID';
      const matchFulfillment = fulfillmentFilter === 'ALL' || ticketStatus === fulfillmentFilter;
      const q = search.toLowerCase().trim();
      const tableCode = (order.table?.code ?? order.diningTable?.code ?? '').toLowerCase();
      const matchSearch =
        !q ||
        order.id.toLowerCase().includes(q) ||
        tableCode.includes(q) ||
        order.items.some((item) => item.productName.toLowerCase().includes(q));
      return matchFilter && matchFulfillment && matchSearch;
    });
  }, [orders, filter, fulfillmentFilter, search]);

  const summary = useMemo(() => {
    const paid = orders.filter((o) => o.status === 'PAID');
    const awaiting = orders.filter((o) => o.status === 'AWAITING_PAYMENT');
    const cancelledOrRefunded = orders.filter(
      (o) => o.status === 'CANCELLED' || o.status === 'REFUNDED',
    );
    const queuedCount = orders.filter((o) => o.fulfillmentTicket?.status === 'QUEUED').length;
    const preparingCount = orders.filter((o) => o.fulfillmentTicket?.status === 'PREPARING').length;
    const readyCount = orders.filter((o) => o.fulfillmentTicket?.status === 'READY').length;
    const handedOverCount = orders.filter(
      (o) => o.fulfillmentTicket?.status === 'HANDED_OVER',
    ).length;
    return {
      totalCount: orders.length,
      paidCount: paid.length,
      paidRevenue: paid.reduce((s, o) => s + o.totalAmount, 0),
      awaitingCount: awaiting.length,
      awaitingAmount: awaiting.reduce((s, o) => s + o.totalAmount, 0),
      cancelledCount: cancelledOrRefunded.length,
      queuedCount,
      preparingCount,
      readyCount,
      handedOverCount,
    };
  }, [orders]);

  if (!actor) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-slate-500 text-sm">
        <RefreshCw className="size-5 animate-spin mr-2 text-orange-600" />
        Đang mở sổ đơn hàng…
      </div>
    );
  }

  if (!actor.permissions.includes('orders.read')) {
    return <AccessDenied area="Đơn hàng" permission="orders.read" />;
  }

  const canCapture = actor.permissions.includes('payments.capture');
  const canCancel = actor.permissions.includes('orders.cancel');
  const canRefund = actor.permissions.includes('payments.refund');

  const filterTabs = [
    { key: 'ALL', label: `Tất cả (${orders.length})` },
    { key: 'AWAITING_PAYMENT', label: `Chờ thu tiền (${summary.awaitingCount})` },
    { key: 'PAID', label: `Đã thanh toán (${summary.paidCount})` },
    { key: 'CANCELLED', label: 'Đã huỷ' },
    { key: 'REFUNDED', label: 'Đã hoàn tiền' },
  ];

  const fulfillmentFilterTabs = [
    { key: 'ALL', label: 'Mọi tiến độ phục vụ' },
    { key: 'QUEUED', label: `⏳ Chưa nhận (${summary.queuedCount})` },
    { key: 'PREPARING', label: `🍳 Đang làm (${summary.preparingCount})` },
    { key: 'READY', label: `🔔 Đang giao / Chờ lấy (${summary.readyCount})` },
    { key: 'HANDED_OVER', label: `✅ Đã giao (${summary.handedOverCount})` },
  ];

  return (
    <div className="w-full p-4 sm:p-6 lg:px-8 space-y-6 font-sans">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-orange-600 uppercase tracking-wider mb-1">
            <Store className="size-3.5" />
            <span>{currentStore?.name ?? 'Chi nhánh đang chọn'}</span>
            <span className="text-slate-300">•</span>
            <span className="text-slate-500">Quản lý giao dịch</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Sổ giao dịch & Danh sách đơn hàng
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load(storeId)}
            disabled={busy}
            className="h-9 gap-1.5 text-xs font-medium cursor-pointer"
          >
            <RefreshCw className={`size-3.5 ${busy ? 'animate-spin text-orange-600' : ''}`} />
            <span>Làm mới</span>
          </Button>

          <Button
            asChild
            size="sm"
            className="h-9 bg-orange-600 hover:bg-orange-700 text-white gap-1.5 text-xs font-semibold shadow-xs"
          >
            <Link href="/pos">
              <CreditCard className="size-3.5" />
              <span>Tạo đơn tại quầy POS</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* 4 KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Tổng đơn phát sinh
          </p>
          <p className="text-2xl font-extrabold text-slate-900 mt-1 font-mono">
            {summary.totalCount} đơn
          </p>
          <p className="text-xs text-slate-500 mt-1">Toàn bộ kênh POS & QR tại bàn</p>
        </div>
        <div className="bg-white rounded-2xl border border-emerald-200 p-4 shadow-2xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
            Đã thanh toán ({summary.paidCount} đơn)
          </p>
          <p className="text-2xl font-extrabold text-emerald-700 mt-1 font-mono">
            {money.format(summary.paidRevenue)}
          </p>
          <p className="text-xs text-slate-500 mt-1">Doanh thu thực thu vào két</p>
        </div>
        <div className="bg-white rounded-2xl border border-amber-200 p-4 shadow-2xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
            Chờ thu tiền ({summary.awaitingCount} đơn)
          </p>
          <p className="text-2xl font-extrabold text-amber-700 mt-1 font-mono">
            {money.format(summary.awaitingAmount)}
          </p>
          <p className="text-xs text-slate-500 mt-1">Đơn QR tại bàn hoặc chờ VietQR</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-rose-600">
            Đơn huỷ / Hoàn tiền
          </p>
          <p className="text-2xl font-extrabold text-rose-600 mt-1 font-mono">
            {summary.cancelledCount} đơn
          </p>
          <p className="text-xs text-slate-500 mt-1">Lưu vết đầy đủ trong Audit Log</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            {filterTabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setFilter(t.key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  filter === t.key
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'bg-slate-100/80 hover:bg-slate-200/80 text-slate-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm theo mã đơn, mã bàn hoặc tên món..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:border-orange-500 focus:bg-white transition-all"
            />
          </div>
        </div>

        {/* Bộ lọc theo tình trạng chế biến & giao món cho POS */}
        <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold text-slate-500 mr-1">Tình trạng phục vụ đơn:</span>
          {fulfillmentFilterTabs.map((ft) => (
            <button
              key={ft.key}
              type="button"
              onClick={() => setFulfillmentFilter(ft.key)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                fulfillmentFilter === ft.key
                  ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {ft.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main 2-Column Layout: Data Table (7 Cols) + Receipt Detail Panel (5 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Structured Orders Data Table (7 Cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">
              Bảng danh sách đơn hàng ({filteredOrders.length})
            </h2>
            <span className="text-[11px] text-slate-400">
              Nhấn vào dòng để xem tiến độ & hỗ trợ khách
            </span>
          </div>

          {filteredOrders.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              Không tìm thấy đơn hàng nào khớp với bộ lọc.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[680px] overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50/90 text-[11px] font-bold uppercase text-slate-500 border-b border-slate-200 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3">Mã đơn</th>
                    <th className="px-3 py-3">Kênh / Bàn</th>
                    <th className="px-3 py-3">Món đặt</th>
                    <th className="px-3 py-3 text-right">Tổng tiền</th>
                    <th className="px-3 py-3 text-center">Thanh toán</th>
                    <th className="px-3 py-3 text-center">Tình trạng đơn</th>
                    <th className="px-4 py-3 text-right">Hỗ trợ nhanh</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredOrders.map((order) => {
                    const statusCfg = statusMap[order.status] ?? {
                      label: order.status,
                      colorClass: 'bg-slate-100 text-slate-800 border-slate-200',
                    };
                    const tableInfo = order.table ?? order.diningTable;
                    const ticketStatus = order.fulfillmentTicket?.status ?? 'UNPAID';
                    const fulfillCfg =
                      order.status === 'CANCELLED'
                        ? fulfillmentStatusMap.VOIDED
                        : (fulfillmentStatusMap[ticketStatus] ?? fulfillmentStatusMap.UNPAID);
                    const isSelected = selected?.id === order.id;
                    const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);

                    return (
                      <tr
                        key={order.id}
                        onClick={() => setSelected(order)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-orange-50/70' : 'hover:bg-slate-50/80'
                        }`}
                      >
                        <td className="px-4 py-3">
                          <span className="font-mono font-bold text-slate-900">
                            #{order.id.slice(0, 8).toUpperCase()}
                          </span>
                          <time className="block text-[10px] text-slate-400 mt-0.5">
                            {new Date(order.createdAt).toLocaleString('vi-VN', {
                              hour: '2-digit',
                              minute: '2-digit',
                              day: '2-digit',
                              month: '2-digit',
                            })}
                          </time>
                        </td>

                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              order.source === 'QR' || order.source === 'TABLE_QR'
                                ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                : 'bg-blue-50 text-blue-700 border border-blue-200'
                            }`}
                          >
                            {order.source === 'QR' || order.source === 'TABLE_QR'
                              ? 'QR Bàn'
                              : 'POS Quầy'}
                          </span>
                          {tableInfo && (
                            <span className="block text-[11px] font-bold text-amber-800 mt-0.5">
                              Bàn {tableInfo.code}
                            </span>
                          )}
                        </td>

                        <td className="px-3 py-3 max-w-[170px]">
                          <p className="font-semibold text-slate-800 truncate">
                            {order.items[0]?.productName ?? 'Đơn hàng'}
                            {order.items.length > 1 ? ` +${order.items.length - 1} món` : ''}
                          </p>
                          <span className="text-[10px] text-slate-400">Tổng {itemCount} phần</span>
                        </td>

                        <td className="px-3 py-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                          {money.format(order.totalAmount)}
                        </td>

                        <td className="px-3 py-3 text-center whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusCfg.colorClass}`}
                          >
                            {order.status === 'PAID' ? (
                              <CheckCircle2 className="size-3" />
                            ) : order.status === 'AWAITING_PAYMENT' ? (
                              <Clock className="size-3" />
                            ) : null}
                            {statusCfg.label}
                          </span>
                        </td>

                        <td className="px-3 py-3 text-center whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${fulfillCfg.colorClass}`}
                          >
                            {ticketStatus === 'PREPARING' && <ChefHat className="size-3" />}
                            {ticketStatus === 'READY' && <BellRing className="size-3" />}
                            {ticketStatus === 'HANDED_OVER' && <PackageCheck className="size-3" />}
                            {ticketStatus === 'QUEUED' && <Clock className="size-3" />}
                            {fulfillCfg.shortLabel}
                          </span>
                        </td>

                        <td
                          className="px-4 py-3 text-right whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {order.status === 'AWAITING_PAYMENT' && canCapture ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleCaptureCash(order)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] cursor-pointer transition-colors"
                            >
                              Thu tiền
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setSelected(order)}
                              className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold text-[11px] cursor-pointer"
                            >
                              Chi tiết
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Column: Order Detail View (5 Cols) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-2xs p-6 space-y-5 sticky top-20">
          {selected ? (
            <>
              {/* Detail Header */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-extrabold text-slate-900 font-mono">
                      Đơn #{selected.id.slice(0, 8).toUpperCase()}
                    </h2>
                    <span
                      className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                        statusMap[selected.status]?.colorClass ?? 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {statusMap[selected.status]?.label ?? selected.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {new Date(selected.createdAt).toLocaleString('vi-VN')}
                    {(selected.table ?? selected.diningTable)
                      ? ` • Bàn ${(selected.table ?? selected.diningTable)!.code}`
                      : ' • Tại quầy / Mang đi'}
                  </p>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    printOrderReceipt({
                      id: selected.id,
                      createdAt: selected.createdAt,
                      source: selected.source,
                      tableCode: (selected.table ?? selected.diningTable)?.code ?? null,
                      subtotalAmount: selected.subtotalAmount,
                      discountAmount: selected.discountAmount,
                      voucherCode: selected.voucherCode,
                      totalAmount: selected.totalAmount,
                      paymentMethod: selected.payments[0]?.method ?? null,
                      storeName: currentStore?.name ?? 'CHICK RES',
                      items: selected.items.map((it) => ({
                        productName: it.productName,
                        variantName: it.variantName,
                        quantity: it.quantity,
                        lineTotal: it.lineTotal,
                        options: it.optionsSnapshot,
                      })),
                    })
                  }
                  className="text-xs gap-1.5 cursor-pointer"
                >
                  <Printer className="size-3.5" />
                  <span>In hóa đơn</span>
                </Button>
              </div>

              {/* Tình trạng chế biến & Giao món (Hỗ trợ khách hàng tại POS) */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                      Tiến độ Phục vụ & Giao món
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Theo dõi trạng thái bếp để hỗ trợ khách tại quầy/bàn
                    </p>
                  </div>
                  <span
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${
                      selected.status === 'CANCELLED'
                        ? fulfillmentStatusMap.VOIDED.colorClass
                        : (
                            fulfillmentStatusMap[selected.fulfillmentTicket?.status ?? 'UNPAID'] ??
                            fulfillmentStatusMap.UNPAID
                          ).colorClass
                    }`}
                  >
                    {selected.status === 'CANCELLED'
                      ? fulfillmentStatusMap.VOIDED.label
                      : (
                          fulfillmentStatusMap[selected.fulfillmentTicket?.status ?? 'UNPAID'] ??
                          fulfillmentStatusMap.UNPAID
                        ).label}
                  </span>
                </div>

                {selected.fulfillmentTicket ? (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {FULFILLMENT_STEPS.map((step, idx) => {
                        const orderSeq: FulfillmentStatusKey[] = [
                          'QUEUED',
                          'PREPARING',
                          'READY',
                          'HANDED_OVER',
                        ];
                        const currentIdx = orderSeq.indexOf(selected.fulfillmentTicket!.status);
                        const isDone = currentIdx >= idx;
                        const isCurrent = currentIdx === idx;
                        const stepTime =
                          step.key === 'QUEUED'
                            ? selected.fulfillmentTicket!.queuedAt
                            : step.key === 'PREPARING'
                              ? selected.fulfillmentTicket!.preparingAt
                              : step.key === 'READY'
                                ? selected.fulfillmentTicket!.readyAt
                                : selected.fulfillmentTicket!.handedOverAt;

                        return (
                          <div
                            key={step.key}
                            className={`p-2.5 rounded-xl border text-left ${
                              isCurrent
                                ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-400/30'
                                : isDone
                                  ? 'bg-emerald-50/70 border-emerald-200'
                                  : 'bg-white/60 border-slate-200 opacity-60'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span
                                className={`text-[11px] font-extrabold ${
                                  isCurrent
                                    ? 'text-amber-900'
                                    : isDone
                                      ? 'text-emerald-800'
                                      : 'text-slate-600'
                                }`}
                              >
                                {step.title}
                              </span>
                              {isDone && <CheckCircle2 className="size-3.5 text-emerald-600" />}
                            </div>
                            <p className="text-[10px] text-slate-500 mt-0.5">{step.subtitle}</p>
                            {stepTime && (
                              <p className="text-[10px] font-mono text-slate-600 mt-1">
                                {new Date(stepTime).toLocaleTimeString('vi-VN', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <p className="text-[11px] text-slate-500 bg-white border border-slate-200 rounded-xl px-3 py-2">
                      Tiến độ do bộ phận Bếp (KDS) cập nhật và tự đồng bộ tại đây. POS chỉ theo dõi
                      để trả lời khách.
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                    Đơn hàng này đang chờ thu tiền. Sau khi thu tiền xong, phiếu chế biến sẽ được
                    tạo tự động để theo dõi trạng thái Chưa nhận → Đang làm → Đang giao → Đã giao.
                  </p>
                )}
              </div>

              {/* Items Table */}
              <div className="space-y-2.5">
                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Danh sách món trong đơn ({selected.items.length})
                </h3>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2">Món ăn / Biến thể</th>
                        <th className="px-2 py-2 text-center">SL</th>
                        <th className="px-3 py-2 text-right">Thành tiền</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selected.items.map((item) => (
                        <tr key={item.id}>
                          <td className="px-3 py-2.5">
                            <p className="font-bold text-slate-900">{item.productName}</p>
                            <p className="text-[11px] text-slate-500">
                              {item.variantName}
                              {item.optionsSnapshot.length > 0 && (
                                <span className="text-orange-700 block">
                                  + {item.optionsSnapshot.map((o) => o.name).join(', ')}
                                </span>
                              )}
                            </p>
                          </td>
                          <td className="px-2 py-2.5 text-center font-mono font-bold text-orange-600">
                            x{item.quantity}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900">
                            {money.format(item.lineTotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Total Summary */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                {selected.discountAmount ? (
                  <div className="flex items-center justify-between text-xs text-emerald-700">
                    <span>Giảm giá {selected.voucherCode ? `(${selected.voucherCode})` : ''}:</span>
                    <span className="font-mono font-bold">
                      -{money.format(selected.discountAmount)}
                    </span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">TỔNG THANH TOÁN:</span>
                  <span className="text-xl font-extrabold text-orange-600 tracking-tight font-mono">
                    {money.format(selected.totalAmount)}
                  </span>
                </div>
              </div>

              {/* Payments History */}
              <div className="space-y-2.5">
                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Nhật ký giao dịch thanh toán
                </h3>
                {selected.payments.length ? (
                  <div className="space-y-2">
                    {selected.payments.map((p) => (
                      <div
                        key={p.id}
                        className="p-3 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="size-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 shadow-2xs">
                            {p.method === 'CASH' ? (
                              <Banknote className="size-4 text-emerald-600" />
                            ) : (
                              <QrCode className="size-4 text-blue-600" />
                            )}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900">
                              {p.method === 'CASH' ? 'Tiền mặt tại quầy' : 'Quét mã VietQR'}
                            </p>
                            <p className="text-[10px] text-slate-400 font-mono">
                              #{p.id.slice(0, 8)} • {p.status}
                            </p>
                          </div>
                        </div>
                        <span className="font-bold font-mono text-slate-900">
                          {money.format(p.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">
                    Chưa có giao dịch thu tiền nào cho đơn này.
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-100 flex flex-wrap gap-2">
                {selected.status === 'AWAITING_PAYMENT' && canCapture && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => void handleCaptureCash(selected)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                  >
                    <Banknote className="size-3.5 mr-1.5" />
                    <span>Thu tiền mặt ({money.format(selected.totalAmount)})</span>
                  </Button>
                )}

                {selected.status === 'AWAITING_PAYMENT' && canCancel && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCancelReason('');
                      setCancelDialogOpen(true);
                    }}
                    className="text-xs text-rose-600 border-rose-200 hover:bg-rose-50 cursor-pointer"
                  >
                    <Ban className="size-3.5 mr-1" />
                    <span>Huỷ đơn hàng</span>
                  </Button>
                )}

                {selected.status === 'PAID' && canRefund && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setRefundReason('');
                      setRefundMethod('CASH');
                      setRefundDialogOpen(true);
                    }}
                    className="text-xs text-rose-600 border-rose-200 hover:bg-rose-50 cursor-pointer font-bold inline-flex items-center gap-1.5"
                  >
                    <RotateCcw className="size-3.5" />
                    <span>Huỷ & Hoàn tiền mặt</span>
                  </Button>
                )}

                {selected.status === 'REFUNDED' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      printRefundReceipt({
                        id: selected.id,
                        orderCreatedAt: selected.createdAt,
                        refundedAt: selected.payments[0]?.refundedAt ?? selected.updatedAt,
                        tableCode: (selected.table ?? selected.diningTable)?.code ?? null,
                        source: selected.source,
                        totalAmount: selected.totalAmount,
                        refundMethod: 'Tiền mặt (Chi từ ca)',
                        refundReason: selected.payments[0]?.refundNote ?? 'Hoàn tiền huỷ đơn',
                        storeName: currentStore?.name,
                        items: selected.items.map((it) => ({
                          productName: it.productName,
                          variantName: it.variantName,
                          quantity: it.quantity,
                          lineTotal: it.lineTotal,
                        })),
                      });
                    }}
                    className="text-xs text-slate-700 border-slate-200 hover:bg-slate-100 cursor-pointer inline-flex items-center gap-1.5 font-semibold"
                  >
                    <Printer className="size-3.5 text-slate-500" />
                    <span>In phiếu hoàn tiền mặt</span>
                  </Button>
                )}

                {selected.status === 'CANCELLED' && (
                  <div className="w-full p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
                    <p className="font-bold text-slate-800">Đơn đã huỷ trước khi thu tiền</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Đơn hàng được huỷ khi chưa thanh toán qua hệ thống nên không phát sinh thu/chi
                      tiền trong ca.
                      {selected.cancellationNote ? ` (Lý do: ${selected.cancellationNote})` : ''}
                    </p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-72 text-center text-slate-400 text-xs">
              <Receipt className="size-10 text-slate-300 mb-2" />
              <p>Chọn một đơn hàng từ bảng bên trái để xem đầy đủ chi tiết.</p>
            </div>
          )}
        </div>
      </div>

      {/* Cancel Order Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-rose-600">Huỷ đơn hàng</DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Nhập lý do huỷ đơn hàng để lưu vào hồ sơ kiểm toán.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              placeholder="VD: Khách đổi ý, nhập sai món..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setCancelDialogOpen(false)}>
              Bỏ qua
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void handleCancelOrder()}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              Xác nhận huỷ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Refund Order Dialog */}
      <Dialog open={refundDialogOpen} onOpenChange={setRefundDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-rose-600 flex items-center gap-2">
              <RotateCcw className="size-4" />
              <span>Huỷ đơn & Hoàn tiền mặt</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Xuất tiền mặt từ két ca làm việc hiện tại để hoàn lại cho khách hàng và huỷ đơn.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-3">
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
              <span className="text-[11px] font-semibold text-amber-800 uppercase block">
                Số tiền mặt cần chi trả lại khách
              </span>
              <span className="text-2xl font-black font-mono text-amber-900">
                {money.format(selected?.totalAmount ?? 0)}
              </span>
              <p className="text-[11px] text-amber-700 mt-1">
                Giao dịch chi hoàn tiền này sẽ được ghi nhận tự động vào sổ ca thu ngân để đối soát
                két cuối ca.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Lý do huỷ & hoàn tiền *</label>
              <Input
                placeholder="VD: Khách đổi ý, hết món, làm sai món..."
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Hình thức hoàn trả</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRefundMethod('CASH')}
                  className={`p-2.5 rounded-xl border text-xs font-bold text-left cursor-pointer transition-colors ${
                    refundMethod === 'CASH'
                      ? 'border-amber-500 bg-amber-50 text-amber-900 ring-2 ring-amber-400/20'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  <p className="font-bold">💵 Tiền mặt (Két ca)</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Xuất tiền từ két quầy</p>
                </button>
                <button
                  type="button"
                  onClick={() => setRefundMethod('ORIGINAL')}
                  className={`p-2.5 rounded-xl border text-xs font-bold text-left cursor-pointer transition-colors ${
                    refundMethod === 'ORIGINAL'
                      ? 'border-amber-500 bg-amber-50 text-amber-900 ring-2 ring-amber-400/20'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  <p className="font-bold">
                    🔄 Gốc (
                    {selected?.payments[0]?.method === 'CASH' ? 'Tiền mặt' : 'VietQR'})
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Theo kênh thanh toán</p>
                </button>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setRefundDialogOpen(false)}>
              Bỏ qua
            </Button>
            <Button
              size="sm"
              disabled={busy || !refundReason.trim()}
              onClick={() => void handleRefundOrder()}
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer"
            >
              Xác nhận chi tiền & Huỷ đơn
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
