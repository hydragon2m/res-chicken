'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Flame,
  ShoppingBag,
  Plus,
  Minus,
  CheckCircle2,
  AlertCircle,
  Armchair,
  ReceiptText,
  UtensilsCrossed,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/thanh-phan/giao-dien/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/thanh-phan/giao-dien/card';
import { Input } from '@/thanh-phan/giao-dien/input';
import { Badge } from '@/thanh-phan/giao-dien/badge';

type TableInfo = {
  id: string;
  tableNumber: string;
  capacity: number;
  store: { id: string; name: string };
};

type MenuItem = {
  id: string;
  name: string;
  description?: string;
  category?: { name: string };
  variants: { id: string; name: string; price: number; isSoldOut?: boolean }[];
};

type CartItem = {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  price: number;
  quantity: number;
};

const money = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

type TableOrder = {
  id: string;
  status: 'AWAITING_PAYMENT' | 'PAID' | 'CANCELLED' | 'REFUNDED';
  totalAmount: number;
  discountAmount: number;
  createdAt: string;
  items: {
    id: string;
    productName: string;
    variantName: string;
    unitPrice: number;
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

type TableOrdersResponse = {
  tableCode: string;
  orders: TableOrder[];
  totalAmount: number;
  unpaidTotal: number;
};

const ORDER_STEPS = [
  { key: 'PLACED', label: 'Đã gửi đơn' },
  { key: 'QUEUED', label: 'Bếp đã nhận' },
  { key: 'PREPARING', label: 'Đang chế biến' },
  { key: 'READY', label: 'Đang mang ra' },
  { key: 'HANDED_OVER', label: 'Đã phục vụ' },
] as const;

function getOrderProgress(order: TableOrder) {
  if (order.fulfillmentTicket?.status === 'VOIDED') {
    return { index: -1, label: 'Đã huỷ', tone: 'bg-red-100 text-red-700' };
  }
  if (order.status === 'AWAITING_PAYMENT' || !order.fulfillmentTicket) {
    return {
      index: 0,
      label: 'Chưa gửi bếp',
      tone: 'bg-slate-100 text-slate-700',
    };
  }
  const map = {
    QUEUED: { index: 1, label: 'Bếp đã nhận, chờ chế biến', tone: 'bg-sky-100 text-sky-700' },
    PREPARING: { index: 2, label: 'Đang chế biến', tone: 'bg-amber-100 text-amber-800' },
    READY: { index: 3, label: 'Món đã xong, đang mang ra', tone: 'bg-violet-100 text-violet-700' },
    HANDED_OVER: { index: 4, label: 'Đã phục vụ', tone: 'bg-emerald-100 text-emerald-700' },
  } as const;
  return map[order.fulfillmentTicket.status as keyof typeof map];
}

const timeFmt = (value?: string | null) =>
  value ? new Date(value).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '';

export default function TableSelfOrderPage({ params }: { params: Promise<{ token: string }> }) {
  const resolvedParams = use(params);
  const token = resolvedParams.token;

  const [table, setTable] = useState<TableInfo | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [voucherCode, setVoucherCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successOrder, setSuccessOrder] = useState<{
    orderId: string;
    totalAmount: number;
  } | null>(null);

  // Current orders of this table
  const [activeTab, setActiveTab] = useState<'menu' | 'orders'>('menu');
  const [tableOrders, setTableOrders] = useState<TableOrdersResponse | null>(null);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const loadTableOrders = useCallback(async () => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    setOrdersLoading(true);
    try {
      const res = await fetch(`${baseUrl}/api/v1/ordering/table/${token}/orders`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const text = await res.text();
      if (text) setTableOrders(JSON.parse(text) as TableOrdersResponse);
    } catch {
      // keep last known state; will retry on next poll
    } finally {
      setOrdersLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadTableOrders();
    const timer = setInterval(() => void loadTableOrders(), 10000);
    return () => clearInterval(timer);
  }, [loadTableOrders]);

  useEffect(() => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    void fetch(`${baseUrl}/api/v1/ordering/table/${token}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Mã bàn không hợp lệ hoặc đã hết hạn.');
        return res.json();
      })
      .then((data) => {
        if (data.table) {
          setTable({
            id: data.table.id,
            tableNumber: data.table.code ?? data.table.name ?? data.table.tableNumber ?? 'Bàn',
            capacity: data.table.capacity,
            store: data.store ?? { id: '', name: 'Chick Res' },
          });
        }
        setItems(
          (data.categories ?? []).flatMap(
            (category: {
              name: string;
              products: Array<{
                id: string;
                name: string;
                variants: Array<{
                  id: string;
                  name: string;
                  isSoldOut?: boolean;
                  prices: Array<{ amount: number }>;
                }>;
              }>;
            }) =>
              category.products.map((product) => ({
                id: product.id,
                name: product.name,
                category: { name: category.name },
                variants: product.variants.map((variant) => ({
                  id: variant.id,
                  name: variant.name,
                  isSoldOut: variant.isSoldOut,
                  price: variant.prices[0]?.amount ?? 0,
                })),
              })),
          ),
        );
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Lỗi tải thông tin bàn');
      })
      .finally(() => setLoading(false));
  }, [token]);

  const addToCart = (product: MenuItem, variant: MenuItem['variants'][0]) => {
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.variantId === variant.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx].quantity += 1;
        return copy;
      }
      return [
        ...prev,
        {
          variantId: variant.id,
          productId: product.id,
          productName: product.name,
          variantName: variant.name,
          price: variant.price || 45000,
          quantity: 1,
        },
      ];
    });
  };

  const updateQuantity = (variantId: string, delta: number) => {
    setCart(
      (prev) =>
        prev
          .map((c) => {
            if (c.variantId === variantId) {
              const nextQty = c.quantity + delta;
              return nextQty > 0 ? { ...c, quantity: nextQty } : null;
            }
            return c;
          })
          .filter(Boolean) as CartItem[],
    );
  };

  const subtotal = cart.reduce((sum, c) => sum + c.price * c.quantity, 0);

  const handleSubmitOrder = async () => {
    if (cart.length === 0 || !table) return;
    setSubmitting(true);
    setError('');
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const submissionKey =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `qr-client-${Date.now()}`;
      const res = await fetch(`${baseUrl}/api/v1/ordering/table/${token}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': submissionKey,
        },
        body: JSON.stringify({
          items: cart.map((c) => ({
            variantId: c.variantId,
            quantity: c.quantity,
            optionIds: [],
          })),
          voucherCode: voucherCode.trim() || undefined,
          idempotencyKey: submissionKey,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.message || 'Không thể tạo đơn gọi món tại bàn.');
      }

      const orderData = await res.json();
      setSuccessOrder(orderData);
      setCart([]);
      void loadTableOrders();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra khi gửi đơn');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 font-sans text-slate-500 text-sm">
        Đang tải thực đơn tại bàn…
      </div>
    );
  }

  if (error && !table) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 font-sans p-6">
        <Card className="max-w-md p-8 text-center space-y-4">
          <AlertCircle className="size-10 text-red-500 mx-auto" />
          <h2 className="text-xl font-bold text-slate-900">Mã bàn không tồn tại</h2>
          <p className="text-xs text-slate-500">{error}</p>
          <Link href="/">
            <Button variant="outline">Trở về Trang chủ</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-28">
      {/* Top Bar with Table Number */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 sm:px-8 lg:px-12 py-3">
        <div className="w-full flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold">
              <Flame className="size-5 fill-current" />
            </div>
            <div>
              <h1 className="text-sm font-extrabold text-slate-900 leading-none">
                {table?.store?.name ?? 'Chick Res'}
              </h1>
              <span className="text-[11px] text-amber-700 font-bold flex items-center gap-1">
                <Armchair className="size-3" />
                <span>Bàn {table?.tableNumber}</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="amber" className="text-[11px] font-bold">
              Tự gọi món (Self-Order)
            </Badge>
          </div>
        </div>
      </header>

      <main className="w-full px-4 sm:px-8 lg:px-12 py-6 space-y-6">
        {/* Success Modal / Banner */}
        {successOrder && (
          <Card className="border border-emerald-300 bg-emerald-50/60 p-6 text-center space-y-3">
            <CheckCircle2 className="size-10 text-emerald-600 mx-auto" />
            <h2 className="text-xl font-extrabold text-emerald-950">
              Đơn gọi món đã được gửi tới bếp!
            </h2>
            <p className="text-xs text-emerald-800">
              Đơn số{' '}
              <span className="font-bold font-mono">
                #{successOrder.orderId.slice(0, 8).toUpperCase()}
              </span>{' '}
              đã được chuyển tới quầy thu ngân và trạm chiên bếp. Quý khách vui lòng chờ trong giây
              lát.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                size="sm"
                onClick={() => setSuccessOrder(null)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Gọi thêm món khác
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSuccessOrder(null);
                  setActiveTab('orders');
                }}
                className="border-emerald-300 text-emerald-800"
              >
                Theo dõi đơn của bàn
              </Button>
            </div>
          </Card>
        )}

        {/* Tabs: Menu | Current table orders */}
        <div className="inline-flex rounded-xl bg-white border border-slate-200 p-1 shadow-2xs">
          <button
            type="button"
            onClick={() => setActiveTab('menu')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
              activeTab === 'menu' ? 'bg-amber-500 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <UtensilsCrossed className="size-3.5" />
            Thực đơn
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('orders');
              void loadTableOrders();
            }}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
              activeTab === 'orders'
                ? 'bg-amber-500 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <ReceiptText className="size-3.5" />
            Đơn của bàn
            {(tableOrders?.orders.length ?? 0) > 0 && (
              <span
                className={`ml-0.5 min-w-5 h-5 px-1 rounded-full text-[10px] grid place-items-center ${
                  activeTab === 'orders' ? 'bg-white text-amber-700' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {tableOrders?.orders.length}
              </span>
            )}
          </button>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
            {error}
          </div>
        )}

        {/* Menu Grid */}
        {activeTab === 'orders' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Đơn hiện tại của bàn</h2>
                <p className="text-xs text-slate-500">
                  Trạng thái được cập nhật tự động mỗi 10 giây từ bếp.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void loadTableOrders()}
                disabled={ordersLoading}
                className="cursor-pointer"
              >
                <RefreshCw className={`size-3.5 mr-1 ${ordersLoading ? 'animate-spin' : ''}`} />
                Làm mới
              </Button>
            </div>

            {!tableOrders || tableOrders.orders.length === 0 ? (
              <Card className="p-8 text-center space-y-3 border-dashed">
                <ReceiptText className="size-8 text-slate-300 mx-auto" />
                <p className="text-sm font-semibold text-slate-700">Bàn chưa có đơn nào</p>
                <p className="text-xs text-slate-500">
                  Chọn món ở tab Thực đơn và gửi đơn, đơn sẽ hiển thị tại đây.
                </p>
                <Button
                  size="sm"
                  onClick={() => setActiveTab('menu')}
                  className="bg-amber-500 hover:bg-amber-600 text-white mx-auto"
                >
                  Xem thực đơn
                </Button>
              </Card>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Card className="p-4">
                    <p className="text-[11px] font-semibold text-slate-500 uppercase">Số đơn</p>
                    <p className="text-xl font-black text-slate-900">{tableOrders.orders.length}</p>
                  </Card>
                  <Card className="p-4">
                    <p className="text-[11px] font-semibold text-slate-500 uppercase">
                      Tổng tiền các đơn
                    </p>
                    <p className="text-xl font-black font-mono text-slate-900">
                      {money.format(tableOrders.totalAmount)}
                    </p>
                  </Card>
                  <Card className="p-4">
                    <p className="text-[11px] font-semibold text-slate-500 uppercase">
                      Chưa thanh toán
                    </p>
                    <p
                      className={`text-xl font-black font-mono ${
                        tableOrders.unpaidTotal > 0 ? 'text-red-600' : 'text-emerald-600'
                      }`}
                    >
                      {money.format(tableOrders.unpaidTotal)}
                    </p>
                  </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {tableOrders.orders.map((order) => {
                    const progress = getOrderProgress(order);
                    const stepTimes = [
                      order.createdAt,
                      order.fulfillmentTicket?.queuedAt,
                      order.fulfillmentTicket?.preparingAt,
                      order.fulfillmentTicket?.readyAt,
                      order.fulfillmentTicket?.handedOverAt,
                    ];
                    return (
                      <Card key={order.id} className="border-slate-200">
                        <CardHeader className="p-4 pb-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <CardTitle className="text-sm font-extrabold font-mono text-slate-900">
                                #{order.id.slice(0, 8).toUpperCase()}
                              </CardTitle>
                              <CardDescription className="text-[11px]">
                                Gửi lúc {timeFmt(order.createdAt)} •{' '}
                                {order.status === 'PAID' ? 'Đã thanh toán' : 'Chưa thanh toán'}
                              </CardDescription>
                            </div>
                            <span
                              className={`text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${progress.tone}`}
                            >
                              {progress.label}
                            </span>
                          </div>

                          {progress.index >= 0 && (
                            <ol className="grid grid-cols-5 gap-1 pt-1">
                              {ORDER_STEPS.map((step, idx) => {
                                const done = idx <= progress.index;
                                const current = idx === progress.index;
                                return (
                                  <li key={step.key} className="space-y-1">
                                    <div
                                      className={`h-1.5 rounded-full ${
                                        done ? 'bg-amber-500' : 'bg-slate-200'
                                      } ${current && idx < 4 ? 'animate-pulse' : ''}`}
                                    />
                                    <p
                                      className={`text-[10px] leading-tight ${
                                        done ? 'font-bold text-slate-800' : 'text-slate-400'
                                      }`}
                                    >
                                      {step.label}
                                    </p>
                                    {done && stepTimes[idx] && (
                                      <p className="text-[10px] font-mono text-slate-500">
                                        {timeFmt(stepTimes[idx])}
                                      </p>
                                    )}
                                  </li>
                                );
                              })}
                            </ol>
                          )}
                        </CardHeader>

                        <CardContent className="p-4 pt-0">
                          <ul className="divide-y divide-slate-100 border-t border-slate-100">
                            {order.items.map((item) => (
                              <li
                                key={item.id}
                                className="flex items-center justify-between py-2 text-xs"
                              >
                                <span className="text-slate-800">
                                  <span className="font-bold font-mono mr-1.5">
                                    {item.quantity}×
                                  </span>
                                  {item.productName}
                                  <span className="text-slate-500"> ({item.variantName})</span>
                                </span>
                                <span className="font-mono font-semibold text-slate-700">
                                  {money.format(item.lineTotal)}
                                </span>
                              </li>
                            ))}
                          </ul>
                          {order.discountAmount > 0 && (
                            <div className="flex justify-between text-xs pt-2 text-emerald-700">
                              <span>Giảm giá</span>
                              <span className="font-mono">
                                -{money.format(order.discountAmount)}
                              </span>
                            </div>
                          )}
                          <div className="flex justify-between text-sm pt-2 border-t border-slate-100 mt-1">
                            <span className="font-bold text-slate-900">Tổng đơn</span>
                            <span className="font-black font-mono text-amber-700">
                              {money.format(order.totalAmount)}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {tableOrders.unpaidTotal > 0 && (
                  <p className="text-xs text-slate-500 text-center">
                    Vui lòng thanh toán tại quầy thu ngân hoặc gọi nhân viên để được hỗ trợ.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'menu' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Thực đơn Gà Rán & Đồ Uống</h2>
              <span className="text-xs text-slate-400">{items.length} món</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {items.map((prod) => (
                <Card
                  key={prod.id}
                  className="border-slate-200 shadow-2xs hover:shadow-md transition-shadow"
                >
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base font-bold text-slate-900 leading-snug">
                        {prod.name}
                      </CardTitle>
                      {prod.category && (
                        <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                          {prod.category.name}
                        </span>
                      )}
                    </div>
                    {prod.description && (
                      <CardDescription className="text-xs text-slate-500 line-clamp-2">
                        {prod.description}
                      </CardDescription>
                    )}
                  </CardHeader>

                  <CardContent className="p-4 pt-1 space-y-2">
                    <div className="space-y-1.5 pt-2 border-t border-slate-100">
                      {prod.variants.map((v) => (
                        <div key={v.id} className="flex items-center justify-between text-xs py-1">
                          <div>
                            <span className="font-semibold text-slate-800">{v.name}</span>
                            <span className="block font-mono font-bold text-amber-700">
                              {money.format(v.price || 45000)}
                            </span>
                          </div>

                          <Button
                            size="xs"
                            onClick={() => addToCart(prod, v)}
                            disabled={v.isSoldOut}
                            className="bg-amber-500 hover:bg-amber-600 text-white font-semibold cursor-pointer"
                          >
                            <Plus className="size-3 mr-1" />
                            <span>Thêm</span>
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Floating Bottom Cart Bar */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 px-4 sm:px-8 lg:px-12 py-4 shadow-2xl animate-in slide-in-from-bottom duration-200">
          <div className="w-full space-y-3">
            {/* Cart summary lines */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingBag className="size-4.5 text-amber-600" />
                <span className="text-xs font-bold text-slate-900">
                  Giỏ hàng ({cart.reduce((sum, c) => sum + c.quantity, 0)} món):
                </span>
                <span className="text-sm font-black font-mono text-amber-700">
                  {money.format(subtotal)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Input
                  placeholder="Mã voucher..."
                  value={voucherCode}
                  onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                  className="h-8 w-32 text-xs font-mono uppercase"
                />
                <Button
                  size="sm"
                  onClick={handleSubmitOrder}
                  disabled={submitting}
                  className="bg-amber-500 hover:bg-amber-600 text-white font-bold cursor-pointer"
                >
                  {submitting ? 'Đang gửi...' : 'Gửi đơn gọi món'}
                </Button>
              </div>
            </div>

            {/* Selected items pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
              {cart.map((c) => (
                <div
                  key={c.variantId}
                  className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 shrink-0 font-medium"
                >
                  <span>
                    {c.productName} ({c.variantName})
                  </span>
                  <div className="flex items-center gap-1 font-bold">
                    <button
                      type="button"
                      onClick={() => updateQuantity(c.variantId, -1)}
                      className="size-4.5 rounded bg-white text-slate-600 flex items-center justify-center hover:bg-slate-200 cursor-pointer"
                    >
                      <Minus className="size-3" />
                    </button>
                    <span className="px-1 font-mono">{c.quantity}</span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(c.variantId, 1)}
                      className="size-4.5 rounded bg-white text-slate-600 flex items-center justify-center hover:bg-slate-200 cursor-pointer"
                    >
                      <Plus className="size-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
