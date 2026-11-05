'use client';

import Link from 'next/link';
import { ReceiptText, X } from 'lucide-react';

export type TableCurrentOrder = {
  id: string;
  status: 'AWAITING_PAYMENT' | 'PAID' | 'CANCELLED' | 'REFUNDED';
  source?: string;
  totalAmount: number;
  discountAmount: number;
  createdAt: string;
  items: {
    id: string;
    productName: string;
    variantName: string;
    quantity: number;
    lineTotal: number;
  }[];
  fulfillmentTicket: {
    status: 'QUEUED' | 'PREPARING' | 'READY' | 'HANDED_OVER' | 'VOIDED';
    queuedAt: string;
    preparingAt?: string | null;
    readyAt?: string | null;
    handedOverAt?: string | null;
  } | null;
};

const money = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

const time = (v?: string | null) =>
  v ? new Date(v).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '';

export function getKitchenProgress(order: TableCurrentOrder) {
  // Unpaid orders have not been sent to the kitchen yet; the payment badge already says so.
  if (order.status === 'AWAITING_PAYMENT' || !order.fulfillmentTicket) {
    return null;
  }
  switch (order.fulfillmentTicket.status) {
    case 'QUEUED':
      return { label: 'Chờ bếp nhận', tone: 'bg-sky-50 text-sky-700 border-sky-200' };
    case 'PREPARING':
      return { label: 'Bếp đang làm', tone: 'bg-amber-50 text-amber-800 border-amber-200' };
    case 'READY':
      return { label: 'Xong, chờ mang ra', tone: 'bg-violet-50 text-violet-700 border-violet-200' };
    case 'HANDED_OVER':
      return { label: 'Đã phục vụ', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    default:
      return { label: 'Đã huỷ bếp', tone: 'bg-red-50 text-red-700 border-red-200' };
  }
}

export function summarizeTableOrders(orders: TableCurrentOrder[] = []) {
  const unpaid = orders.filter((o) => o.status === 'AWAITING_PAYMENT');
  const inKitchen = orders.filter(
    (o) =>
      o.status === 'PAID' &&
      o.fulfillmentTicket &&
      ['QUEUED', 'PREPARING', 'READY'].includes(o.fulfillmentTicket.status),
  );
  return {
    count: orders.length,
    total: orders.reduce((s, o) => s + o.totalAmount, 0),
    unpaidCount: unpaid.length,
    unpaidTotal: unpaid.reduce((s, o) => s + o.totalAmount, 0),
    inKitchenCount: inKitchen.length,
    readyCount: orders.filter((o) => o.fulfillmentTicket?.status === 'READY').length,
  };
}

/** Compact summary shown on a table card. */
export function TableOrdersSummary({
  orders,
  onOpen,
}: {
  orders?: TableCurrentOrder[];
  onOpen: () => void;
}) {
  const s = summarizeTableOrders(orders);
  if (s.count === 0) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left p-2 rounded-lg bg-white border border-rose-200 hover:border-rose-400 text-[11px] space-y-1 cursor-pointer transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-slate-900 inline-flex items-center gap-1">
          <ReceiptText className="size-3.5 text-rose-600" />
          {s.count} đơn • {money.format(s.total)}
        </span>
        <span className="text-rose-700 font-bold underline-offset-2 hover:underline">Xem đơn</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {s.unpaidCount > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 font-bold">
            Chưa thu {money.format(s.unpaidTotal)}
          </span>
        )}
        {s.inKitchenCount > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 font-bold">
            {s.inKitchenCount} đơn đang ở bếp
          </span>
        )}
        {s.readyCount > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 font-bold">
            {s.readyCount} đơn chờ mang ra
          </span>
        )}
      </div>
    </button>
  );
}

/** Read-only list of a table's current orders (usable inline, e.g. inside another dialog). */
export function TableOrdersList({ orders }: { orders: TableCurrentOrder[] }) {
  return (
    <div className="space-y-3">
      {orders.length === 0 ? (
        <p className="text-center text-xs text-slate-400 py-8">Bàn chưa có đơn nào đang mở.</p>
      ) : (
        orders.map((order) => {
          const progress = getKitchenProgress(order);
          return (
            <div key={order.id} className="rounded-xl border border-slate-200 p-3.5 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-mono font-extrabold text-sm text-slate-900">
                    #{order.id.slice(0, 8).toUpperCase()}
                  </span>
                  <span className="text-[11px] text-slate-500 ml-2">
                    {time(order.createdAt)} •{' '}
                    {order.source === 'TABLE_QR' ? 'Khách tự gọi (QR)' : 'POS'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      order.status === 'PAID'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-red-50 text-red-700 border-red-200'
                    }`}
                  >
                    {order.status === 'PAID' ? 'Đã thanh toán' : 'Chưa thanh toán'}
                  </span>
                  {progress && (
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${progress.tone}`}
                    >
                      {progress.label}
                    </span>
                  )}
                </div>
              </div>

              <ul className="divide-y divide-slate-100 text-xs">
                {order.items.map((it) => (
                  <li key={it.id} className="flex justify-between py-1.5">
                    <span className="text-slate-800">
                      <span className="font-mono font-bold mr-1.5">{it.quantity}×</span>
                      {it.productName}
                      <span className="text-slate-500"> ({it.variantName})</span>
                    </span>
                    <span className="font-mono text-slate-700">{money.format(it.lineTotal)}</span>
                  </li>
                ))}
              </ul>

              <div className="flex items-center justify-between pt-1.5 border-t border-slate-100">
                <span className="text-[10px] text-slate-500 font-mono">
                  {order.fulfillmentTicket
                    ? [
                        ['Nhận', order.fulfillmentTicket.queuedAt],
                        ['Làm', order.fulfillmentTicket.preparingAt],
                        ['Xong', order.fulfillmentTicket.readyAt],
                        ['Giao', order.fulfillmentTicket.handedOverAt],
                      ]
                        .filter(([, v]) => v)
                        .map(([k, v]) => `${k} ${time(v)}`)
                        .join(' → ')
                    : ''}
                </span>
                <span className="text-sm font-black font-mono text-amber-700">
                  {money.format(order.totalAmount)}
                </span>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

/** Read-only dialog listing the current orders of a table for staff. */
export function TableOrdersDialog({
  tableCode,
  tableName,
  orders,
  onClose,
}: {
  tableCode: string;
  tableName?: string;
  orders: TableCurrentOrder[];
  onClose: () => void;
}) {
  const s = summarizeTableOrders(orders);
  return (
    <div
      className="fixed inset-0 z-[60] bg-slate-950/50 backdrop-blur-[2px] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] bg-white rounded-2xl shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-extrabold text-slate-900">
              Đơn hiện tại • Bàn {tableCode}
              {tableName ? ` (${tableName})` : ''}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {s.count} đơn • Tổng {money.format(s.total)}
              {s.unpaidTotal > 0 && (
                <span className="text-red-600 font-bold">
                  {' '}
                  • Chưa thu {money.format(s.unpaidTotal)}
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="size-8 rounded-lg hover:bg-slate-100 grid place-items-center cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <TableOrdersList orders={orders} />
        </div>

        <div className="px-5 py-3 border-t border-slate-100 flex justify-between items-center gap-2">
          <p className="text-[11px] text-slate-500">
            Thu tiền / in hoá đơn tại màn Hoá đơn. Tiến độ bếp do KDS cập nhật.
          </p>
          <Link
            href="/orders"
            className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold"
          >
            Mở màn Hoá đơn
          </Link>
        </div>
      </div>
    </div>
  );
}
