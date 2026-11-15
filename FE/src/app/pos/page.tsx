'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  Search,
  X,
  CreditCard,
  QrCode,
  Banknote,
  Plus,
  Minus,
  Printer,
  CheckCircle2,
  Clock,
  Settings2,
  Flame,
  RefreshCw,
  CalendarDays,
  Users,
  UtensilsCrossed,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import { AccessDenied } from '../../components/access-denied';
import { ApiError, apiRequest, getActor, type Actor } from '../../lib/auth';
import { printOrderReceipt, printRefundReceipt } from '../../lib/print-receipt';
import { useActiveStore } from '../../lib/store-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  TableOrdersList,
  TableOrdersSummary,
  type TableCurrentOrder,
} from '@/features/tables/table-orders';

type Option = { id: string; name: string; priceDelta: number };
type OptionLink = {
  optionGroup: {
    id: string;
    name: string;
    minSelections: number;
    maxSelections: number;
    options: Option[];
  };
};
type Variant = { id: string; name: string; prices: { amount: number }[] };
type RecipeSummaryLine = {
  ingredientId: string;
  name: string;
  unit: string;
  required: number;
  available: number;
};
type Product = {
  id: string;
  name: string;
  imageUrl?: string | null;
  variants: Variant[];
  optionGroups: OptionLink[];
  hasRecipe?: boolean;
  availableServings?: number | null;
  recipeSummary?: RecipeSummaryLine[];
};
type MenuCategory = { id: string; name: string; products: Product[] };
type CashMovement = {
  id: string;
  kind: string;
  amount: number;
  note?: string | null;
};
type Shift = {
  id: string;
  openedAt: string;
  cashMovements: CashMovement[];
  expectedCash?: number | null;
  variance?: number | null;
};
type CartLine = {
  id: string;
  productName: string;
  variantId: string;
  variantName: string;
  unitPrice: number;
  quantity: number;
  options: Option[];
};
type Order = {
  id: string;
  source?: string;
  status: string;
  subtotalAmount?: number;
  discountAmount?: number;
  taxRate?: number;
  taxAmount?: number;
  totalAmount: number;
  createdAt?: string;
  updatedAt?: string;
  table?: { id: string; code: string; name?: string } | null;
  diningTable?: { id: string; code: string; name?: string } | null;
  items: {
    productName: string;
    variantName: string;
    quantity: number;
    lineTotal: number;
    optionsSnapshot: Option[];
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

type StoreSettings = {
  name?: string;
  phone?: string;
  address?: string;
  taxCode?: string;
  taxRate?: number;
  receiptHeader?: string;
  receiptFooter?: string;
};
type VietQrPaymentRequest = {
  orderReference: string;
  amount: number;
  content: string;
  qrCode: string;
  qrLink?: string | null;
};
type PosTable = {
  id: string;
  code: string;
  name: string;
  capacity: number;
  status: 'AVAILABLE' | 'OCCUPIED' | 'RESERVED';
  orders?: TableCurrentOrder[];
};
type PosReservation = {
  id: string;
  customerName: string;
  customerPhone: string;
  guestCount: number;
  reservationTime: string;
  status: 'PENDING' | 'CONFIRMED' | 'SEATED' | 'CANCELLED' | 'COMPLETED';
  tableId?: string | null;
  table?: { id: string; code: string; name?: string } | null;
  specialNotes?: string | null;
};

const money = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});
const key = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

export default function PosPage() {
  const router = useRouter();
  const { currentStoreId: storeId, currentStore, loading: storeLoading } = useActiveStore();
  const [actor, setActor] = useState<Actor | null>(null);
  const [menu, setMenu] = useState<MenuCategory[]>([]);
  const [shift, setShift] = useState<Shift | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [draft, setDraft] = useState<{
    product: Product;
    variant: Variant;
    selected: Record<string, string[]>;
  } | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [openingCash, setOpeningCash] = useState('0');
  const [declaredCash, setDeclaredCash] = useState('');
  const [adjustment, setAdjustment] = useState({ amount: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Dialog States
  const [openShiftDialogOpen, setOpenShiftDialogOpen] = useState(false);
  const [manageShiftDialogOpen, setManageShiftDialogOpen] = useState(false);
  const [cancelOrderDialogOpen, setCancelOrderDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [posRefundDialogOpen, setPosRefundDialogOpen] = useState(false);
  const [posRefundReason, setPosRefundReason] = useState('');
  const [cashPayDialogOpen, setCashPayDialogOpen] = useState(false);
  const [receivedCash, setReceivedCash] = useState<number>(0);
  const [vietQrPayment, setVietQrPayment] = useState<
    (VietQrPaymentRequest & { image: string }) | null
  >(null);
  const [voucherCode, setVoucherCode] = useState('');
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
  const [tables, setTables] = useState<PosTable[]>([]);
  const [reservations, setReservations] = useState<PosReservation[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string>('');
  const [posTableDialogOpen, setPosTableDialogOpen] = useState(false);
  const [posOrdersTableId, setPosOrdersTableId] = useState<string | null>(null);
  const posOrdersTable = tables.find((t) => t.id === posOrdersTableId) ?? null;
  const [posTableTab, setPosTableTab] = useState<'tables' | 'reservations' | 'new'>('tables');
  const [posTableFilter, setPosTableFilter] = useState<'ALL' | 'AVAILABLE' | 'OCCUPIED' | 'RESERVED'>('ALL');

  const filteredPosTables = useMemo(() => {
    if (posTableFilter === 'ALL') return tables;
    return tables.filter((t) => t.status === posTableFilter);
  }, [tables, posTableFilter]);

  const posTableCounts = useMemo(
    () => ({
      all: tables.length,
      available: tables.filter((t) => t.status === 'AVAILABLE').length,
      occupied: tables.filter((t) => t.status === 'OCCUPIED').length,
      reserved: tables.filter((t) => t.status === 'RESERVED').length,
    }),
    [tables],
  );
  const [newResName, setNewResName] = useState('');
  const [newResPhone, setNewResPhone] = useState('');
  const [newResGuests, setNewResGuests] = useState(4);
  const [newResDate, setNewResDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [newResTime, setNewResTime] = useState('19:00');
  const [newResTableId, setNewResTableId] = useState('');
  const [newResNotes, setNewResNotes] = useState('');

  const can = useCallback(
    (permission: string) => actor?.permissions.includes(permission) ?? false,
    [actor],
  );
  const expectedCash =
    shift?.cashMovements.reduce((sum, movement) => sum + movement.amount, 0) ?? 0;
  const total = useMemo(
    () => cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0),
    [cart],
  );

  const filteredMenu = useMemo(() => {
    return menu
      .filter((cat) => selectedCategory === 'all' || cat.id === selectedCategory)
      .map((cat) => {
        if (!searchQuery.trim()) return cat;
        const q = searchQuery.toLowerCase().trim();
        const filteredProducts = cat.products.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.variants.some((v) => v.name.toLowerCase().includes(q)),
        );
        return { ...cat, products: filteredProducts };
      })
      .filter((cat) => cat.products.length > 0);
  }, [menu, selectedCategory, searchQuery]);

  const run = async <T,>(action: () => Promise<T>) => {
    setBusy(true);
    try {
      return await action();
    } catch (value) {
      const msg =
        value instanceof ApiError ? value.message : 'Không thể hoàn tất yêu cầu. Vui lòng thử lại.';
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const load = useCallback(
    async (activeStoreId: string) => {
      const [fetchedMenu, fetchedShift, fetchedSettings, fetchedTables, fetchedReservations] =
        await Promise.all([
          apiRequest<MenuCategory[]>(`/menu?storeId=${activeStoreId}`),
          can('shifts.read')
            ? apiRequest<Shift>(`/shifts/current?storeId=${activeStoreId}`).catch(() => null)
            : Promise.resolve(null),
          apiRequest<StoreSettings>(`/settings/store/${activeStoreId}`).catch(() => null),
          apiRequest<PosTable[]>(`/tables?storeId=${activeStoreId}`).catch(() => []),
          apiRequest<PosReservation[]>(`/reservations?storeId=${activeStoreId}`).catch(() => []),
        ]);

      setMenu(fetchedMenu);
      setShift(fetchedShift);
      setStoreSettings(fetchedSettings);
      setTables(Array.isArray(fetchedTables) ? fetchedTables : []);
      setReservations(Array.isArray(fetchedReservations) ? fetchedReservations : []);
    },
    [can],
  );

  useEffect(() => {
    void getActor()
      .then(setActor)
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) router.replace('/login');
      });
  }, [router]);

  useEffect(() => {
    if (!storeId || !actor) return;
    void run(() => load(storeId));
  }, [storeId, actor, load]);

  const orderId = order?.id;
  const orderStatus = order?.status;

  useEffect(() => {
    if (!orderId || !vietQrPayment || orderStatus !== 'AWAITING_PAYMENT') return;
    const timer = window.setInterval(() => {
      void apiRequest<Order>(`/orders/${orderId}`)
        .then((next) => {
          setOrder(next);
          if (next.status === 'PAID') {
            setVietQrPayment(null);
            toast.success('Đã nhận thanh toán VietQR. Đang chuẩn bị hóa đơn.');
          }
        })
        .catch(() => undefined);
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [orderId, orderStatus, vietQrPayment]);

  useEffect(() => {
    if (!storeId || !orderId || orderStatus !== 'AWAITING_PAYMENT') return;
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

        es.addEventListener('order.paid', (e: MessageEvent) => {
          try {
            const payload = JSON.parse(e.data);
            if (payload?.orderId === orderId) {
              void apiRequest<Order>(`/orders/${orderId}`).then((next) => {
                setOrder(next);
                setVietQrPayment(null);
                toast.success('Đã nhận thanh toán VietQR tức thì! Đang in hóa đơn.');
              });
            }
          } catch {
            // ignore parse error
          }
        });
      } catch {
        // Fallback to polling already in place
      }
    })();

    return () => {
      isCancelled = true;
      if (es) es.close();
    };
  }, [storeId, orderId, orderStatus]);

  const selectVariant = (product: Product, variant: Variant) => {
    const currentProductQty = cart
      .filter((item) => item.productName === product.name)
      .reduce((sum, item) => sum + item.quantity, 0);
    if (
      product.availableServings !== null &&
      product.availableServings !== undefined &&
      currentProductQty >= product.availableServings
    ) {
      const shortage = product.recipeSummary?.find((r) => r.available < r.required);
      toast.error(
        product.availableServings <= 0
          ? `Không thể chọn "${product.name}": thiếu nguyên liệu kho${shortage ? ` (${shortage.name}: cần ${shortage.required}, tồn ${shortage.available})` : ''}.`
          : `Tồn kho định lượng chỉ đủ tối đa ${product.availableServings} phần "${product.name}".`,
      );
      return;
    }
    if (product.optionGroups.length) {
      setDraft({ product, variant, selected: {} });
    } else {
      addLine(product, variant, []);
    }
  };

  const addLine = (product: Product, variant: Variant, options: Option[]) => {
    const unitPrice =
      (variant.prices[0]?.amount ?? 0) +
      options.reduce((sum, option) => sum + option.priceDelta, 0);
    setCart((current) => [
      ...current,
      {
        id: key(),
        productName: product.name,
        variantId: variant.id,
        variantName: variant.name,
        unitPrice,
        quantity: 1,
        options,
      },
    ]);
    setDraft(null);
    toast.success(`Đã thêm ${product.name} vào giỏ`);
  };

  const toggleOption = (group: OptionLink['optionGroup'], optionId: string) =>
    setDraft((current) => {
      if (!current) return null;
      const selected = current.selected[group.id] ?? [];
      const next = selected.includes(optionId)
        ? selected.filter((id) => id !== optionId)
        : [...selected, optionId];
      return next.length > group.maxSelections
        ? current
        : { ...current, selected: { ...current.selected, [group.id]: next } };
    });

  const confirmModifiers = () => {
    if (!draft) return;
    const groups = draft.product.optionGroups.map((link) => link.optionGroup);
    if (groups.some((group) => (draft.selected[group.id] ?? []).length < group.minSelections)) {
      toast.warning('Vui lòng chọn đủ modifier bắt buộc.');
      return;
    }
    addLine(
      draft.product,
      draft.variant,
      groups.flatMap((group) =>
        group.options.filter((option) => (draft.selected[group.id] ?? []).includes(option.id)),
      ),
    );
  };

  const openShift = () =>
    run(async () => {
      if (!storeId) return;
      const next = await apiRequest<Shift>('/shifts/open', {
        method: 'POST',
        headers: { 'Idempotency-Key': key() },
        body: JSON.stringify({ storeId, openingCash: Number(openingCash) }),
      });
      setShift(next);
      setOpenShiftDialogOpen(false);
      toast.success('Đã mở ca làm việc thành công');
    });

  const closeShift = () =>
    run(async () => {
      if (!shift) return;
      const closed = await apiRequest<Shift>(`/shifts/${shift.id}/close`, {
        method: 'POST',
        headers: { 'Idempotency-Key': key() },
        body: JSON.stringify({
          declaredCash: Number(declaredCash || expectedCash),
        }),
      });
      setShift(null);
      setDeclaredCash('');
      setManageShiftDialogOpen(false);
      toast.success(
        `Đã đóng ca. Kỳ vọng ${money.format(closed.expectedCash ?? 0)}, chênh lệch ${money.format(closed.variance ?? 0)}.`,
      );
    });

  const adjustCash = () =>
    run(async () => {
      if (!shift) return;
      const amount = Number(adjustment.amount);
      if (!amount || !adjustment.note.trim()) {
        toast.warning('Nhập số tiền khác 0 và lý do điều chỉnh.');
        return;
      }
      const next = await apiRequest<Shift>(`/shifts/${shift.id}/adjustments`, {
        method: 'POST',
        headers: { 'Idempotency-Key': key() },
        body: JSON.stringify({ amount, note: adjustment.note.trim() }),
      });
      setShift(next);
      setAdjustment({ amount: '', note: '' });
      toast.success('Đã ghi điều chỉnh tiền mặt');
    });

  const createOrder = () =>
    run(async () => {
      if (!shift) {
        toast.warning('Hãy mở ca làm việc trước khi tạo đơn hàng.');
        return;
      }
      if (!cart.length) return;
      const next = await apiRequest<Order>('/orders', {
        method: 'POST',
        headers: { 'Idempotency-Key': key() },
        body: JSON.stringify({
          storeId,
          tableId: selectedTableId || undefined,
          items: cart.map((line) => ({
            variantId: line.variantId,
            quantity: line.quantity,
            optionIds: line.options.map((option) => option.id),
          })),
          voucherCode: voucherCode.trim() || undefined,
        }),
      });
      setOrder(next);
      setCart([]);
      setVoucherCode('');
      if (storeId) await load(storeId);
      toast.success(`Đã tạo đơn #${next.id.slice(0, 8).toUpperCase()}`);
    });

  const handlePosTableStatus = (tableId: string, status: PosTable['status']) => {
    // Client-side guard: Prevent changing to AVAILABLE or RESERVED if table has unpaid orders
    if (status === 'AVAILABLE' || status === 'RESERVED') {
      const targetTable = tables.find((t: PosTable) => t.id === tableId);
      const unpaidOrders = (targetTable?.orders || []).filter(
        (o) => o.status === 'AWAITING_PAYMENT',
      );
      if (unpaidOrders.length > 0) {
        toast.error(
          `Bàn ${targetTable?.code ?? ''} đang có ${unpaidOrders.length} hóa đơn chưa thanh toán. Vui lòng thanh toán hoặc hủy đơn trước!`,
        );
        setPosOrdersTableId(tableId);
        return;
      }
    }

    return run(async () => {
      await apiRequest(`/tables/${tableId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      if (storeId) await load(storeId);
      toast.success('Đã cập nhật trạng thái bàn ăn');
    });
  };

  const handlePosReservationStatus = (
    res: PosReservation,
    status: PosReservation['status'],
    selectForOrder = false,
  ) => {
    // Client-side guard: Prevent completing (or cancelling while seated) if table has unpaid orders
    if ((status === 'COMPLETED' || status === 'CANCELLED') && res.tableId) {
      const targetTable = tables.find((t: PosTable) => t.id === res.tableId);
      const unpaidOrders = (targetTable?.orders || []).filter(
        (o) => o.status === 'AWAITING_PAYMENT',
      );
      if (unpaidOrders.length > 0) {
        toast.error(
          `Bàn ${targetTable?.code ?? ''} đang có ${unpaidOrders.length} hóa đơn chưa thanh toán. Vui lòng thu tiền trước khi đóng bàn!`,
        );
        setPosOrdersTableId(res.tableId);
        return;
      }
    }

    return run(async () => {
      await apiRequest(`/reservations/${res.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, tableId: res.tableId || undefined }),
      });
      if (selectForOrder && res.tableId) {
        setSelectedTableId(res.tableId);
        setPosTableDialogOpen(false);
      }
      if (storeId) await load(storeId);
      toast.success(
        selectForOrder
          ? `Đã nhận bàn cho khách ${res.customerName} và chọn bàn vào giỏ POS!`
          : status === 'SEATED'
            ? 'Đã nhận khách vào bàn'
            : status === 'COMPLETED'
              ? 'Đã hoàn tất lịch đặt bàn'
              : 'Đã cập nhật trạng thái đặt bàn',
      );
    });
  };

  const handlePosCreateReservation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId || !newResName.trim() || !newResPhone.trim()) {
      toast.warning('Vui lòng nhập tên và số điện thoại khách đặt bàn.');
      return;
    }
    void run(async () => {
      const isoTime = new Date(`${newResDate}T${newResTime}:00`).toISOString();
      await apiRequest('/reservations', {
        method: 'POST',
        body: JSON.stringify({
          storeId,
          customerName: newResName.trim(),
          customerPhone: newResPhone.trim(),
          guestCount: Number(newResGuests) || 2,
          reservationTime: isoTime,
          tableId: newResTableId || undefined,
          specialNotes: newResNotes.trim() || undefined,
        }),
      });
      setNewResName('');
      setNewResPhone('');
      setNewResNotes('');
      setPosTableTab('reservations');
      if (storeId) await load(storeId);
      toast.success('Đã tạo lịch đặt bàn ngay tại quầy POS!');
    });
  };

  const pay = (method: 'CASH' | 'QR_MANUAL') =>
    run(async () => {
      if (!order) return;
      await apiRequest<{ order: Order }>(`/orders/${order.id}/payments`, {
        method: 'POST',
        headers: { 'Idempotency-Key': key() },
        body: JSON.stringify({ method, amount: order.totalAmount }),
      });
      setOrder(await apiRequest<Order>(`/orders/${order.id}`));
      if (storeId) await load(storeId);
      setCashPayDialogOpen(false);
      toast.success(method === 'CASH' ? 'Đã thu tiền mặt thành công' : 'Đã xác nhận thanh toán QR');
    });

  const requestVietQr = () =>
    run(async () => {
      if (!order) return;
      const request = await apiRequest<VietQrPaymentRequest>(
        `/orders/${order.id}/payments/vietqr`,
        {
          method: 'POST',
        },
      );
      const image = await QRCode.toDataURL(request.qrCode, {
        width: 320,
        margin: 2,
        errorCorrectionLevel: 'M',
      });
      setVietQrPayment({ ...request, image });
    });

  const cancelOrder = () =>
    run(async () => {
      if (!order) return;
      if (!cancelReason.trim()) {
        toast.warning('Vui lòng nhập lý do huỷ đơn.');
        return;
      }
      const next = await apiRequest<Order>(`/orders/${order.id}/cancel`, {
        method: 'POST',
        headers: { 'Idempotency-Key': key() },
        body: JSON.stringify({ note: cancelReason.trim() }),
      });
      setOrder(next);
      setCancelOrderDialogOpen(false);
      setCancelReason('');
      toast.info('Đơn hàng đã được huỷ.');
    });

  const refund = () =>
    run(async () => {
      const payment = order?.payments[0];
      if (!payment) return;
      if (!posRefundReason.trim()) {
        toast.warning('Vui lòng nhập lý do hoàn tiền.');
        return;
      }
      await apiRequest<{ order: Order }>(`/payments/${payment.id}/refund`, {
        method: 'POST',
        headers: { 'Idempotency-Key': key() },
        body: JSON.stringify({
          note: posRefundReason.trim(),
          refundMethod: 'CASH',
        }),
      });
      const updated = await apiRequest<Order>(`/orders/${order.id}`);
      setOrder(updated);
      if (storeId) await load(storeId);
      setPosRefundDialogOpen(false);
      toast.success(`Đã hoàn trả ${money.format(order.totalAmount)} tiền mặt cho khách.`);

      // Tự động in phiếu hoàn tiền mặt
      printRefundReceipt({
        id: order.id,
        orderCreatedAt: order.createdAt,
        refundedAt: new Date().toISOString(),
        tableCode: (order.table ?? order.diningTable)?.code ?? null,
        source: order.source,
        totalAmount: order.totalAmount,
        refundMethod: 'Tiền mặt (Chi từ ca POS)',
        refundReason: posRefundReason.trim(),
        storeName: storeSettings?.name ?? currentStore?.name,
        storeAddress: storeSettings?.address,
        storePhone: storeSettings?.phone,
        items: order.items.map((it) => ({
          productName: it.productName,
          variantName: it.variantName,
          quantity: it.quantity,
          lineTotal: it.lineTotal,
        })),
      });
    });

  if (!actor || storeLoading || !storeId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-3 text-slate-500 text-sm">
        <RefreshCw className="size-6 animate-spin text-orange-600" />
        <p>Đang đồng bộ thực đơn và ca bán hàng POS…</p>
      </div>
    );
  }

  if (!actor.permissions.includes('orders.create')) {
    return <AccessDenied area="POS" permission="orders.create" />;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-var(--header-height,3.5rem))] bg-slate-100 overflow-hidden font-sans">
      {/* Top POS Action & Shift Ribbon */}
      <div className="h-14 bg-white border-b border-slate-200 px-4 flex items-center justify-between gap-4 shrink-0 shadow-2xs">
        {/* Fast Search */}
        <div className="relative w-72 sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm món nhanh hoặc mã..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 text-xs rounded-lg bg-slate-100 border border-slate-200 text-slate-900 focus:outline-none focus:bg-white focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* Shift & Tables Status Widget */}
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPosTableDialogOpen(true)}
            className="h-8 text-xs font-semibold gap-1.5 border-amber-300 bg-amber-50/80 text-amber-950 hover:bg-amber-100 cursor-pointer"
          >
            <UtensilsCrossed className="size-3.5 text-amber-700" />
            <span>Bàn & Đặt bàn</span>
            <span className="px-1.5 py-0.2 rounded bg-white text-[10px] font-bold text-slate-700 border border-amber-200">
              {tables.filter((t) => t.status === 'AVAILABLE').length}/{tables.length} trống •{' '}
              {
                reservations.filter((r) => r.status === 'PENDING' || r.status === 'CONFIRMED')
                  .length
              }{' '}
              lịch đặt
            </span>
          </Button>

          {!shift ? (
            <Button
              size="sm"
              onClick={() => setOpenShiftDialogOpen(true)}
              className="h-8 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold gap-1.5 shadow-xs cursor-pointer"
            >
              <Clock className="size-3.5" />
              <span>Mở ca bán hàng</span>
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-semibold">Ca đang mở</span>
                <span className="text-emerald-300">|</span>
                <span className="font-mono text-emerald-900 font-bold">
                  {money.format(expectedCash)}
                </span>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setManageShiftDialogOpen(true)}
                className="h-8 text-xs font-medium gap-1 text-slate-700 cursor-pointer"
              >
                <Settings2 className="size-3.5 text-slate-500" />
                <span>Quản lý ca</span>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Main Body: 2 Columns (Menu Grid Left, Order Sidebar Right) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Column: Menu Categories & Food Grid */}
        <div className="flex-1 flex flex-col overflow-hidden p-4">
          {/* Category Pills */}
          {menu.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-3 shrink-0 scrollbar-none">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  selectedCategory === 'all'
                    ? 'bg-orange-600 text-white shadow-sm shadow-orange-600/30'
                    : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200/90'
                }`}
              >
                Tất cả ({menu.reduce((acc, cat) => acc + cat.products.length, 0)})
              </button>
              {menu.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    selectedCategory === cat.id
                      ? 'bg-orange-600 text-white shadow-sm shadow-orange-600/30'
                      : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200/90'
                  }`}
                >
                  {cat.name} ({cat.products.length})
                </button>
              ))}
            </div>
          )}

          {/* Food Grid Scrollable Container */}
          <div className="flex-1 overflow-y-auto pr-1">
            {menu.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 text-xs">
                Chưa có món ăn nào trong thực đơn chi nhánh này.
              </div>
            ) : filteredMenu.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-500 text-xs">
                <p>Không tìm thấy món nào với từ khoá &ldquo;{searchQuery}&rdquo;</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('all');
                  }}
                  className="text-xs"
                >
                  Xoá bộ lọc
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3.5">
                {filteredMenu.flatMap((category) =>
                  category.products.flatMap((product) =>
                    product.variants.map((variant) => (
                      <div
                        key={variant.id}
                        onClick={() => selectVariant(product, variant)}
                        className="group flex flex-col justify-between bg-white rounded-2xl border border-slate-200/80 hover:border-orange-500/50 hover:shadow-md transition-all duration-200 cursor-pointer overflow-hidden p-3.5 select-none"
                      >
                        <div>
                          {/* Image Thumbnail / Illustration */}
                          <div className="relative w-full aspect-4/3 rounded-xl overflow-hidden bg-gradient-to-tr from-amber-100 to-orange-50 mb-3 flex items-center justify-center">
                            {product.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={product.imageUrl}
                                alt={product.name}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex flex-col items-center justify-center text-orange-600">
                                <Flame className="size-8" />
                                <span className="text-[10px] font-bold text-orange-800 uppercase tracking-widest mt-1">
                                  {product.name.slice(0, 3)}
                                </span>
                              </div>
                            )}
                            <span className="absolute top-2 left-2 text-[10px] font-semibold text-slate-700 bg-white/90 backdrop-blur-xs px-2 py-0.5 rounded-md shadow-2xs">
                              {category.name}
                            </span>
                            {product.availableServings !== null &&
                              product.availableServings !== undefined && (
                                <span
                                  className={`absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-md shadow-2xs ${
                                    product.availableServings <= 0
                                      ? 'bg-rose-600 text-white'
                                      : product.availableServings <= 10
                                        ? 'bg-amber-500 text-slate-950'
                                        : 'bg-emerald-600 text-white'
                                  }`}
                                >
                                  {product.availableServings <= 0
                                    ? 'Hết NVL kho'
                                    : `Đủ ${product.availableServings} phần`}
                                </span>
                              )}
                          </div>

                          <h3 className="font-bold text-sm text-slate-900 group-hover:text-orange-600 transition-colors line-clamp-1">
                            {product.name}
                          </h3>
                          <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                            {variant.name}
                          </p>
                        </div>

                        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                          <span className="text-sm font-extrabold text-orange-600">
                            {money.format(variant.prices[0]?.amount ?? 0)}
                          </span>
                          <span className="size-7 rounded-lg bg-orange-50 group-hover:bg-orange-600 text-orange-600 group-hover:text-white flex items-center justify-center transition-colors">
                            <Plus className="size-4" />
                          </span>
                        </div>
                      </div>
                    )),
                  ),
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Order Ticket / Cart Sidebar */}
        <div className="w-96 xl:w-[420px] bg-white border-l border-slate-200 flex flex-col shrink-0 shadow-lg z-10">
          {!order ? (
            /* Mode 1: Active Cart */
            <>
              {/* Cart Header */}
              <div className="p-4 border-b border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <span>Đơn hàng</span>
                      <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-800">
                        {cart.reduce((sum, item) => sum + item.quantity, 0)} món
                      </Badge>
                    </h2>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Quầy thu ngân • {currentStore?.name}
                    </p>
                  </div>

                  {cart.length > 0 && (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setCart([])}
                      className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                    >
                      Xoá tất cả
                    </Button>
                  )}
                </div>

                {/* Chọn Bàn ăn / Mang về ngay trên POS */}
                <div className="flex items-center gap-2">
                  <select
                    aria-label="Chọn bàn ăn hoặc mang về"
                    value={selectedTableId}
                    onChange={(e) => setSelectedTableId(e.target.value)}
                    className="flex-1 h-9 px-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-800 focus:outline-none focus:border-orange-500 focus:bg-white"
                  >
                    <option value="">🛍️ Mang về / Ăn tại quầy (Không gán bàn)</option>
                    {tables.map((t) => (
                      <option key={t.id} value={t.id}>
                        🍽️ {t.code} - {t.name} ({t.capacity} ghế) •{' '}
                        {t.status === 'AVAILABLE'
                          ? 'Trống'
                          : t.status === 'RESERVED'
                            ? 'Đã đặt trước'
                            : 'Đang có khách'}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => setPosTableDialogOpen(true)}
                    className="h-9 px-2.5 text-xs font-bold text-amber-800 border-amber-200 bg-amber-50 hover:bg-amber-100 shrink-0 cursor-pointer"
                  >
                    <CalendarDays className="size-3.5 mr-1" />
                    Đặt bàn
                  </Button>
                </div>
              </div>

              {/* Cart Items List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {cart.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center text-slate-400 p-8 space-y-2">
                    <div className="size-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                      <CreditCard className="size-6" />
                    </div>
                    <p className="text-sm font-semibold text-slate-700">Giỏ hàng đang trống</p>
                    <p className="text-xs text-slate-400">
                      Chạm vào các món ăn bên thực đơn để tạo đơn hàng mới.
                    </p>
                  </div>
                ) : (
                  cart.map((line) => (
                    <div
                      key={line.id}
                      className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-900 truncate">
                          {line.productName}
                        </p>
                        <p className="text-[11px] text-slate-500 font-medium">
                          {line.variantName}
                          {line.options.length > 0 && (
                            <span className="text-orange-700 block mt-0.5 font-normal">
                              + {line.options.map((o) => o.name).join(', ')}
                            </span>
                          )}
                        </p>
                        <p className="text-xs font-extrabold text-slate-900 mt-1">
                          {money.format(line.unitPrice * line.quantity)}
                        </p>
                      </div>

                      {/* Quantity Controls */}
                      <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
                        <button
                          onClick={() =>
                            setCart((lines) =>
                              lines.flatMap((item) =>
                                item.id !== line.id
                                  ? [item]
                                  : item.quantity === 1
                                    ? []
                                    : [{ ...item, quantity: item.quantity - 1 }],
                              ),
                            )
                          }
                          className="size-6 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-600 transition-colors"
                        >
                          <Minus className="size-3" />
                        </button>
                        <span className="w-6 text-center text-xs font-bold text-slate-900">
                          {line.quantity}
                        </span>
                        <button
                          onClick={() =>
                            setCart((lines) =>
                              lines.map((item) =>
                                item.id === line.id
                                  ? { ...item, quantity: item.quantity + 1 }
                                  : item,
                              ),
                            )
                          }
                          className="size-6 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-600 transition-colors"
                        >
                          <Plus className="size-3" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Cart Checkout Footer */}
              <div className="p-4 border-t border-slate-200 bg-slate-50/50 space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>Tạm tính</span>
                  <span className="font-semibold text-slate-900">{money.format(total)}</span>
                </div>

                {/* Voucher / Mã giảm giá */}
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Mã voucher giảm giá..."
                    value={voucherCode}
                    onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                    className="h-8 text-xs font-mono uppercase bg-white border-slate-200"
                  />
                  {voucherCode && (
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => setVoucherCode('')}
                      className="text-xs text-slate-400 hover:text-slate-600"
                    >
                      Xoá
                    </Button>
                  )}
                </div>

                <div className="flex items-center justify-between text-base font-extrabold text-slate-900 pt-1 border-t border-slate-200">
                  <span>TỔNG TIỀN MÓN</span>
                  <span className="text-xl text-amber-600 font-mono font-black">
                    {money.format(total)}
                  </span>
                </div>

                <Button
                  size="lg"
                  disabled={busy || !cart.length || !shift || !can('orders.create')}
                  onClick={() => void createOrder()}
                  className="w-full h-12 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-bold text-sm shadow-md shadow-amber-500/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  {busy ? 'Đang tạo đơn…' : 'Tạo đơn & Thanh toán →'}
                </Button>
              </div>
            </>
          ) : order.status === 'AWAITING_PAYMENT' ? (
            /* Mode 2: Awaiting Payment Screen */
            <div className="flex-1 flex flex-col justify-between p-5">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                  <div>
                    <Badge
                      variant="outline"
                      className="bg-amber-50 text-amber-800 border-amber-300"
                    >
                      Chờ thu tiền
                    </Badge>
                    <h2 className="text-lg font-bold text-slate-900 mt-1">
                      Đơn #{order.id.slice(0, 8).toUpperCase()}
                    </h2>
                  </div>
                  <button
                    onClick={() => setOrder(null)}
                    className="size-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                {/* Items preview */}
                <div className="py-4 space-y-2 max-h-64 overflow-y-auto">
                  {order.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-xs text-slate-700">
                      <span>
                        {item.quantity}× {item.productName} ({item.variantName})
                      </span>
                      <span className="font-semibold">{money.format(item.lineTotal)}</span>
                    </div>
                  ))}
                </div>

                <div className="p-4 rounded-xl bg-orange-50 border border-orange-200/80 text-center my-2">
                  <span className="text-xs text-orange-800 font-medium">Số tiền cần thu</span>
                  <div className="text-3xl font-extrabold text-orange-600 tracking-tight mt-0.5">
                    {money.format(order.totalAmount)}
                  </div>
                </div>
              </div>

              {/* Payment Action Buttons */}
              <div className="space-y-2.5 pt-4 border-t border-slate-200">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={() => {
                      setReceivedCash(order.totalAmount);
                      setCashPayDialogOpen(true);
                    }}
                    disabled={busy || !can('payments.capture')}
                    className="h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Banknote className="size-4" />
                    <span>Tiền mặt</span>
                  </Button>

                  <Button
                    onClick={() => void requestVietQr()}
                    disabled={busy || !can('payments.capture')}
                    className="h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs gap-1.5 shadow-xs cursor-pointer"
                  >
                    <QrCode className="size-4" />
                    <span>Quét mã QR</span>
                  </Button>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCancelOrderDialogOpen(true)}
                  disabled={busy || !can('orders.cancel')}
                  className="w-full text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700 border-rose-200"
                >
                  Huỷ đơn hàng này
                </Button>
              </div>
            </div>
          ) : order.status === 'PAID' ? (
            /* Mode 3: Clean Receipt View */
            <div className="flex-1 flex flex-col justify-between p-5 overflow-y-auto">
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                  <div className="flex items-center gap-2 text-emerald-600">
                    <CheckCircle2 className="size-5" />
                    <span className="text-sm font-bold">Thanh toán thành công</span>
                  </div>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => {
                      setOrder(null);
                      setCart([]);
                    }}
                  >
                    + Đơn mới
                  </Button>
                </div>

                {/* Printable receipt card */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3 font-mono text-xs">
                  <div className="text-center pb-2 border-b border-dashed border-slate-300">
                    {storeSettings?.receiptHeader ? (
                      <p className="text-[11px] text-slate-600 font-sans italic mb-1">
                        {storeSettings.receiptHeader}
                      </p>
                    ) : null}
                    <p className="font-bold text-sm text-slate-900 font-sans">
                      {storeSettings?.name ?? currentStore?.name ?? 'CHICK RES'}
                    </p>
                    {storeSettings?.address && (
                      <p className="text-[10px] text-slate-500 font-sans">
                        {storeSettings.address}
                      </p>
                    )}
                    {storeSettings?.phone && (
                      <p className="text-[10px] text-slate-500 font-sans">
                        Hotline: {storeSettings.phone}
                      </p>
                    )}
                    {storeSettings?.taxCode && (
                      <p className="text-[10px] text-slate-500 font-sans">
                        MST: {storeSettings.taxCode}
                      </p>
                    )}
                    <p className="text-[10px] font-semibold text-slate-700 font-sans mt-1">
                      HÓA ĐƠN BÁN HÀNG
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      #{order.id.slice(0, 8).toUpperCase()} •{' '}
                      {order.createdAt ? new Date(order.createdAt).toLocaleTimeString('vi-VN') : ''}
                    </p>
                  </div>

                  <div className="space-y-1.5 py-1">
                    {order.items.map((item, i) => (
                      <div key={i} className="flex justify-between text-[11px]">
                        <span>
                          {item.quantity}× {item.productName}
                        </span>
                        <span className="font-semibold">{money.format(item.lineTotal)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-dashed border-slate-300 space-y-1">
                    <div className="flex justify-between text-[11px] text-slate-600">
                      <span>Tạm tính:</span>
                      <span>{money.format(order.subtotalAmount ?? order.totalAmount)}</span>
                    </div>

                    {(order.discountAmount ?? 0) > 0 && (
                      <div className="flex justify-between text-[11px] text-amber-700 font-semibold">
                        <span>Giảm giá / Voucher:</span>
                        <span>-{money.format(order.discountAmount!)}</span>
                      </div>
                    )}

                    {(order.taxAmount ?? 0) > 0 && (
                      <div className="flex justify-between text-[11px] text-slate-600">
                        <span>
                          VAT ({((order.taxRate ?? storeSettings?.taxRate ?? 0) * 100).toFixed(0)}
                          %):
                        </span>
                        <span>+{money.format(order.taxAmount!)}</span>
                      </div>
                    )}

                    <div className="pt-1 border-t border-slate-300 flex justify-between font-bold text-xs text-slate-900">
                      <span>TỔNG TIỀN:</span>
                      <span>{money.format(order.totalAmount)}</span>
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-500 flex justify-between">
                    <span>Hình thức:</span>
                    <span>
                      {order.payments[0]?.method === 'CASH' ? 'Tiền mặt' : 'QR Chuyển khoản'}
                    </span>
                  </div>

                  {storeSettings?.receiptFooter ? (
                    <div className="text-center pt-2 border-t border-dashed border-slate-300 text-[10px] text-slate-500 italic">
                      {storeSettings.receiptFooter}
                    </div>
                  ) : (
                    <div className="text-center pt-2 border-t border-dashed border-slate-300 text-[10px] text-slate-500 italic">
                      Cảm ơn quý khách và hẹn gặp lại!
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2 pt-4">
                <Button
                  onClick={() =>
                    printOrderReceipt({
                      id: order.id,
                      createdAt: order.createdAt,
                      source: 'POS',
                      subtotalAmount: order.subtotalAmount,
                      discountAmount: order.discountAmount,
                      taxRate: order.taxRate ?? storeSettings?.taxRate,
                      taxAmount: order.taxAmount,
                      totalAmount: order.totalAmount,
                      paymentMethod: order.payments[0]?.method ?? null,
                      storeName: storeSettings?.name ?? currentStore?.name ?? 'CHICK RES',
                      storeAddress: storeSettings?.address,
                      storePhone: storeSettings?.phone,
                      storeTaxCode: storeSettings?.taxCode,
                      receiptHeader: storeSettings?.receiptHeader,
                      receiptFooter: storeSettings?.receiptFooter,
                      items: order.items.map((it) => ({
                        productName: it.productName,
                        variantName: it.variantName,
                        quantity: it.quantity,
                        lineTotal: it.lineTotal,
                        options: it.optionsSnapshot,
                      })),
                    })
                  }
                  variant="outline"
                  className="w-full text-xs gap-1.5 cursor-pointer"
                >
                  <Printer className="size-4" />
                  <span>In hoá đơn</span>
                </Button>
                <Button
                  onClick={() => {
                    setOrder(null);
                    setCart([]);
                  }}
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold"
                >
                  Bắt đầu đơn hàng mới
                </Button>
                {can('payments.refund') && (
                  <Button
                    onClick={() => {
                      setPosRefundReason('');
                      setPosRefundDialogOpen(true);
                    }}
                    variant="outline"
                    size="xs"
                    className="w-full text-xs text-rose-600 border-rose-200 hover:bg-rose-50 font-bold"
                  >
                    Huỷ đơn & Hoàn tiền mặt
                  </Button>
                )}
              </div>
            </div>
          ) : (
            /* Cancelled / Refunded Mode */
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-3">
              <div className="size-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center">
                <X className="size-6" />
              </div>
              <h3 className="font-bold text-slate-900">
                {order.status === 'REFUNDED' ? 'Đơn đã hoàn tiền' : 'Đơn đã được huỷ'}
              </h3>
              <p className="text-xs text-slate-500">Mã đơn #{order.id.slice(0, 8).toUpperCase()}</p>
              {order.status === 'REFUNDED' && (
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => {
                    printRefundReceipt({
                      id: order.id,
                      orderCreatedAt: order.createdAt,
                      refundedAt: order.payments[0]?.refundedAt ?? order.updatedAt,
                      tableCode: (order.table ?? order.diningTable)?.code ?? null,
                      source: order.source,
                      totalAmount: order.totalAmount,
                      refundMethod: 'Tiền mặt (Chi từ ca POS)',
                      refundReason: order.payments[0]?.refundNote ?? 'Hoàn tiền huỷ đơn',
                      storeName: storeSettings?.name ?? currentStore?.name,
                      storeAddress: storeSettings?.address,
                      storePhone: storeSettings?.phone,
                      items: order.items.map((it) => ({
                        productName: it.productName,
                        variantName: it.variantName,
                        quantity: it.quantity,
                        lineTotal: it.lineTotal,
                      })),
                    });
                  }}
                  className="text-xs text-slate-700 border-slate-200"
                >
                  <Printer className="size-3.5 mr-1" />
                  In lại phiếu hoàn tiền
                </Button>
              )}
              <Button
                onClick={() => {
                  setOrder(null);
                  setCart([]);
                }}
                className="bg-orange-600 text-white text-xs font-semibold"
              >
                Tiếp tục tạo đơn mới
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Modifier Customization Modal (Draft) */}
      {draft && (
        <Dialog open={!!draft} onOpenChange={(open) => !open && setDraft(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>Tuỳ chọn món ăn</span>
                <Badge variant="outline">{draft.product.name}</Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Biến thể: {draft.variant.name} • Chọn các tuỳ chọn vị sốt và món kèm
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2 max-h-80 overflow-y-auto">
              {draft.product.optionGroups.map(({ optionGroup }) => {
                const selected = draft.selected[optionGroup.id] ?? [];
                return (
                  <div key={optionGroup.id} className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                      <span>{optionGroup.name}</span>
                      <span className="text-[11px] font-normal text-slate-500">
                        (Chọn {optionGroup.minSelections}–{optionGroup.maxSelections})
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {optionGroup.options.map((option) => {
                        const isChecked = selected.includes(option.id);
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => toggleOption(optionGroup, option.id)}
                            className={`p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer flex flex-col justify-between ${
                              isChecked
                                ? 'bg-orange-50 border-orange-500 text-orange-950 font-semibold shadow-2xs'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <span>{option.name}</span>
                            {option.priceDelta > 0 && (
                              <span className="text-[10px] text-orange-600 font-bold mt-1">
                                +{money.format(option.priceDelta)}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => setDraft(null)}>
                Huỷ
              </Button>
              <Button
                size="sm"
                onClick={confirmModifiers}
                className="bg-orange-600 hover:bg-orange-700 text-white font-semibold"
              >
                Xác nhận thêm vào giỏ
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Open Shift Dialog */}
      <Dialog open={openShiftDialogOpen} onOpenChange={setOpenShiftDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Mở ca làm việc POS</DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Nhập số tiền mặt có sẵn trong két đầu ca để bắt đầu giao dịch.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <label className="text-xs font-semibold text-slate-700">Tiền mặt đầu ca (₫)</label>
            <Input
              type="number"
              min="0"
              placeholder="0"
              value={openingCash}
              onChange={(e) => setOpeningCash(e.target.value)}
              className="text-lg font-bold font-mono"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpenShiftDialogOpen(false)}>
              Huỷ
            </Button>
            <Button
              size="sm"
              disabled={busy || !can('shifts.open')}
              onClick={() => void openShift()}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              Mở ca ngay
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Shift Dialog (Close / Adjust Cash) */}
      <Dialog open={manageShiftDialogOpen} onOpenChange={setManageShiftDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Đối soát & Đóng ca</DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Kỳ vọng tiền két hiện tại:{' '}
              <strong className="text-slate-900 font-mono">{money.format(expectedCash)}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <label className="text-xs font-semibold text-slate-700">
                Tiền thực tế khi kiểm két (₫)
              </label>
              <Input
                type="number"
                min="0"
                placeholder={String(expectedCash)}
                value={declaredCash}
                onChange={(e) => setDeclaredCash(e.target.value)}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={busy || !can('shifts.close')}
                onClick={() => void closeShift()}
                className="w-full text-xs font-semibold text-rose-600 hover:bg-rose-50"
              >
                Chốt đối soát & Đóng ca
              </Button>
            </div>

            {can('shifts.adjust') && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <p className="text-xs font-semibold text-slate-700">Điều chỉnh thu/chi trong ca</p>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    placeholder="+/- Số tiền"
                    value={adjustment.amount}
                    onChange={(e) => setAdjustment({ ...adjustment, amount: e.target.value })}
                  />
                  <Input
                    placeholder="Lý do chi/thu..."
                    value={adjustment.note}
                    onChange={(e) => setAdjustment({ ...adjustment, note: e.target.value })}
                  />
                </div>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => void adjustCash()}
                  className="w-full text-xs bg-slate-900 text-white"
                >
                  Lưu khoản điều chỉnh
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancel Order Dialog */}
      <Dialog open={cancelOrderDialogOpen} onOpenChange={setCancelOrderDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-rose-600">Huỷ đơn hàng</DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Nhập lý do huỷ đơn để ghi vào nhật ký vận hành kiểm toán.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              placeholder="VD: Khách đổi ý, lỗi nhập món..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setCancelOrderDialogOpen(false)}>
              Bỏ qua
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void cancelOrder()}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              Xác nhận huỷ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* POS Refund Cash Dialog */}
      <Dialog open={posRefundDialogOpen} onOpenChange={setPosRefundDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-rose-600 flex items-center gap-1.5">
              <RotateCcw className="size-4" />
              <span>Huỷ đơn & Hoàn tiền mặt</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Chi tiền mặt từ két ca thu ngân để hoàn lại cho khách hàng và huỷ đơn.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
              <span className="text-[11px] font-semibold text-amber-800 uppercase block">
                Tiền mặt cần trả lại khách
              </span>
              <span className="text-xl font-black font-mono text-amber-900">
                {money.format(order?.totalAmount ?? 0)}
              </span>
              <p className="text-[10px] text-amber-700 mt-0.5">
                Khoản chi này sẽ ghi nhận vào ca thu ngân hiện tại.
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Lý do huỷ & hoàn tiền *</label>
              <Input
                placeholder="VD: Khách đổi ý, hết món..."
                value={posRefundReason}
                onChange={(e) => setPosRefundReason(e.target.value)}
                className="text-xs"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setPosRefundDialogOpen(false)}>
              Bỏ qua
            </Button>
            <Button
              size="sm"
              disabled={busy || !posRefundReason.trim()}
              onClick={() => void refund()}
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
            >
              Xác nhận hoàn tiền mặt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cash Calculator Dialog */}
      <Dialog open={cashPayDialogOpen} onOpenChange={setCashPayDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Banknote className="size-5 text-emerald-600" />
              <span>Thu tiền mặt</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Đơn hàng: {money.format(order?.totalAmount ?? 0)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-semibold text-slate-700">Khách đưa (₫)</label>
              <Input
                type="number"
                value={receivedCash || ''}
                onChange={(e) => setReceivedCash(Number(e.target.value))}
                className="text-lg font-bold font-mono mt-1"
              />
            </div>

            {/* Quick cash pills */}
            <div className="grid grid-cols-3 gap-1.5">
              {[50000, 100000, 200000, 500000].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setReceivedCash(amt)}
                  className="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-mono font-semibold text-slate-800 transition-colors"
                >
                  {money.format(amt)}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setReceivedCash(order?.totalAmount ?? 0)}
                className="col-span-2 px-2 py-1.5 rounded-lg bg-orange-100 hover:bg-orange-200 text-xs font-semibold text-orange-900 transition-colors"
              >
                Đúng số tiền ({money.format(order?.totalAmount ?? 0)})
              </button>
            </div>

            {/* Change calculation */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600">Tiền thối lại:</span>
              <span
                className={`text-base font-bold font-mono ${
                  receivedCash >= (order?.totalAmount ?? 0) ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {money.format(Math.max(0, receivedCash - (order?.totalAmount ?? 0)))}
              </span>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setCashPayDialogOpen(false)}>
              Huỷ
            </Button>
            <Button
              size="sm"
              disabled={busy || receivedCash < (order?.totalAmount ?? 0)}
              onClick={() => void pay('CASH')}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
            >
              Xác nhận đã nhận tiền
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(vietQrPayment)}
        onOpenChange={(open) => !open && setVietQrPayment(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <QrCode className="size-5 text-blue-600" />
              <span>Thanh toán VietQR</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Khách quét mã bằng ứng dụng ngân hàng. Màn hình sẽ tự cập nhật khi nhận được tiền.
            </DialogDescription>
          </DialogHeader>
          {vietQrPayment && (
            <div className="space-y-3 py-2 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={vietQrPayment.image}
                alt={`Mã VietQR cho đơn ${vietQrPayment.orderReference}`}
                className="mx-auto size-72 rounded-xl border border-slate-200 bg-white p-2"
              />
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-left text-xs">
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Số tiền</span>
                  <strong className="font-mono text-slate-900">
                    {money.format(vietQrPayment.amount)}
                  </strong>
                </div>
                <div className="mt-1 flex justify-between gap-3">
                  <span className="text-slate-500">Nội dung</span>
                  <strong className="font-mono text-slate-900">{vietQrPayment.content}</strong>
                </div>
              </div>
              <p className="flex items-center justify-center gap-1.5 text-xs text-blue-700">
                <RefreshCw className="size-3.5 animate-spin" /> Đang chờ VietQR xác nhận
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setVietQrPayment(null)}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Quản lý Sơ đồ Bàn & Đặt bàn ngay tại POS */}
      <Dialog open={posTableDialogOpen} onOpenChange={setPosTableDialogOpen}>
        <DialogContent className="w-[94vw] sm:max-w-4xl md:max-w-5xl lg:max-w-6xl max-h-[88vh] flex flex-col p-4 sm:p-6 overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <UtensilsCrossed className="size-5 text-amber-600" />
              <span>Điều phối Bàn ăn & Lịch Đặt bàn tại POS</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Chọn bàn cho đơn hàng, đổi trạng thái bàn, nhận khách đặt trước hoặc tạo lịch đặt bàn
              mới ngay tại quầy thu ngân.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
            <button
              type="button"
              onClick={() => setPosTableTab('tables')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                posTableTab === 'tables'
                  ? 'bg-amber-500 text-slate-950 shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              1. Sơ đồ Bàn ăn ({tables.length})
            </button>
            <button
              type="button"
              onClick={() => setPosTableTab('reservations')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                posTableTab === 'reservations'
                  ? 'bg-amber-500 text-slate-950 shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              2. Lịch Đặt bàn ({reservations.length})
            </button>
            <button
              type="button"
              onClick={() => setPosTableTab('new')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                posTableTab === 'new'
                  ? 'bg-amber-500 text-slate-950 shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              + Tạo Đặt bàn mới
            </button>
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden py-2 space-y-3">
            {posTableTab === 'tables' && posOrdersTable && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-extrabold text-slate-900">
                      Đơn hiện tại • Bàn {posOrdersTable.code}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Tiến độ bếp do KDS cập nhật. Thu tiền / in hoá đơn tại màn Hoá đơn.
                    </p>
                  </div>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => setPosOrdersTableId(null)}
                    className="text-xs cursor-pointer font-bold"
                  >
                    ← Trở lại danh sách bàn
                  </Button>
                </div>
                <TableOrdersList orders={posOrdersTable.orders ?? []} />
              </div>
            )}

            {posTableTab === 'tables' && !posOrdersTable && (
              <div className="space-y-3">
                {/* Status Filter Tabs */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {(
                      [
                        ['ALL', `Tất cả (${posTableCounts.all})`],
                        ['AVAILABLE', `🟢 Bàn trống (${posTableCounts.available})`],
                        ['OCCUPIED', `🔴 Có khách (${posTableCounts.occupied})`],
                        ['RESERVED', `🟡 Đã đặt (${posTableCounts.reserved})`],
                      ] as const
                    ).map(([filterKey, label]) => (
                      <button
                        key={filterKey}
                        type="button"
                        onClick={() => setPosTableFilter(filterKey)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          posTableFilter === filterKey
                            ? 'bg-slate-900 text-white shadow-2xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <span className="text-[11px] text-slate-500 font-medium hidden sm:inline">
                    Chọn bàn để gắn vào đơn hàng POS
                  </span>
                </div>

                {filteredPosTables.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-xs">
                    Không tìm thấy bàn nào theo bộ lọc đã chọn.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                    {filteredPosTables.map((t) => {
                      const isSelected = selectedTableId === t.id;
                      return (
                        <div
                          key={t.id}
                          className={`rounded-2xl border p-3 transition-all flex flex-col justify-between gap-2.5 shadow-2xs min-w-0 ${
                            isSelected
                              ? 'border-orange-500 bg-orange-50/70 ring-2 ring-orange-500/25'
                              : t.status === 'OCCUPIED'
                                ? 'border-rose-200 bg-rose-50/30 hover:border-rose-400'
                                : t.status === 'RESERVED'
                                  ? 'border-amber-200 bg-amber-50/30 hover:border-amber-400'
                                  : 'border-slate-200 bg-white hover:border-emerald-400'
                          }`}
                        >
                          <div className="space-y-2 min-w-0">
                            {/* Card Header: Table code, name, capacity, status badge */}
                            <div className="flex items-start justify-between gap-1.5 min-w-0">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-baseline gap-1.5 flex-wrap">
                                  <span className="text-base font-black font-mono text-slate-900 tracking-tight shrink-0">
                                    {t.code}
                                  </span>
                                  <span
                                    className="text-xs font-semibold text-slate-600 truncate max-w-[120px]"
                                    title={t.name}
                                  >
                                    {t.name}
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                                  <Users className="size-3 text-slate-400 shrink-0" />
                                  <span>{t.capacity} chỗ</span>
                                </p>
                              </div>

                              <Badge
                                className={`text-[10px] shrink-0 font-bold px-2 py-0.5 border ${
                                  t.status === 'AVAILABLE'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    : t.status === 'RESERVED'
                                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                                      : 'bg-rose-50 text-rose-800 border-rose-200'
                                }`}
                              >
                                {t.status === 'AVAILABLE'
                                  ? 'Trống'
                                  : t.status === 'RESERVED'
                                    ? 'Đã đặt'
                                    : 'Có khách'}
                              </Badge>
                            </div>

                            {/* Orders Summary (clean pill) */}
                            <TableOrdersSummary
                              orders={t.orders}
                              onOpen={() => setPosOrdersTableId(t.id)}
                            />
                          </div>

                          <div className="space-y-2 pt-2 border-t border-slate-100">
                            {/* 3-pill status toggle */}
                            {(() => {
                              const hasUnpaid = (t.orders || []).some(
                                (o) => o.status === 'AWAITING_PAYMENT',
                              );
                              return (
                                <div className="grid grid-cols-3 gap-0.5 bg-slate-100/90 p-0.5 rounded-lg text-center">
                                  {(
                                    [
                                      ['AVAILABLE', 'Trống'],
                                      ['OCCUPIED', 'Khách'],
                                      ['RESERVED', 'Đặt'],
                                    ] as const
                                  ).map(([st, label]) => {
                                    const isLocked =
                                      hasUnpaid &&
                                      t.status !== st &&
                                      (st === 'AVAILABLE' || st === 'RESERVED');
                                    return (
                                      <button
                                        key={st}
                                        type="button"
                                        disabled={busy || t.status === st}
                                        onClick={() => void handlePosTableStatus(t.id, st)}
                                        title={
                                          isLocked
                                            ? 'Bàn có hóa đơn chưa thanh toán - không thể đổi trạng thái!'
                                            : undefined
                                        }
                                        className={`py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                                          t.status === st
                                            ? 'bg-white text-slate-900 shadow-2xs'
                                            : isLocked
                                              ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                                              : 'text-slate-500 hover:text-slate-900'
                                        }`}
                                      >
                                        {isLocked ? `🔒 ${label}` : label}
                                      </button>
                                    );
                                  })}
                                </div>
                              );
                            })()}

                            {/* Primary Action Button */}
                            <Button
                              size="xs"
                              onClick={() => {
                                setSelectedTableId(t.id);
                                setPosTableDialogOpen(false);
                                toast.success(`Đã chọn bàn ${t.code} cho đơn hàng POS`);
                              }}
                              className={`w-full text-xs font-bold transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs'
                                  : 'bg-orange-600 hover:bg-orange-700 text-white'
                              }`}
                            >
                              {isSelected ? (
                                <>
                                  <CheckCircle2 className="size-3.5 mr-1" />
                                  Đang chọn bàn
                                </>
                              ) : (
                                'Chọn bàn gọi món'
                              )}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {posTableTab === 'reservations' && (
              <div className="space-y-2.5">
                {reservations.length === 0 ? (
                  <p className="text-center text-xs text-slate-400 py-8">
                    Chưa có lịch đặt bàn nào tại chi nhánh.
                  </p>
                ) : (
                  reservations.map((res) => (
                    <div
                      key={res.id}
                      className="p-3 rounded-xl border border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-extrabold text-slate-900">
                            {res.customerName}
                          </span>
                          <span className="text-xs font-mono text-slate-600">
                            ({res.customerPhone})
                          </span>
                          <Badge variant="outline" className="text-[10px]">
                            {res.guestCount} khách
                          </Badge>
                          {res.table && (
                            <Badge className="bg-amber-100 text-amber-900 text-[10px]">
                              Bàn {res.table.code}
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500">
                          Giờ hẹn: {new Date(res.reservationTime).toLocaleString('vi-VN')} • Trạng
                          thái: <strong>{res.status}</strong>
                        </p>
                        {res.specialNotes && (
                          <p className="text-[11px] text-amber-800">Ghi chú: {res.specialNotes}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {(res.status === 'PENDING' || res.status === 'CONFIRMED') && (
                          <Button
                            size="xs"
                            disabled={busy}
                            onClick={() => void handlePosReservationStatus(res, 'SEATED', true)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                          >
                            Nhận bàn & Gọi món
                          </Button>
                        )}
                        {res.status === 'SEATED' && (
                          <Button
                            size="xs"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void handlePosReservationStatus(res, 'COMPLETED', false)}
                            className="text-xs font-bold cursor-pointer"
                          >
                            Hoàn tất
                          </Button>
                        )}
                        {(res.status === 'PENDING' || res.status === 'CONFIRMED') && (
                          <Button
                            size="xs"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => void handlePosReservationStatus(res, 'CANCELLED', false)}
                            className="text-xs text-rose-600 hover:bg-rose-50 cursor-pointer"
                          >
                            Hủy lịch
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {posTableTab === 'new' && (
              <form onSubmit={handlePosCreateReservation} className="space-y-3 p-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Tên khách hàng *</label>
                    <Input
                      required
                      value={newResName}
                      onChange={(e) => setNewResName(e.target.value)}
                      placeholder="VD: Anh Minh / Chị Lan"
                      className="text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Số điện thoại *</label>
                    <Input
                      required
                      value={newResPhone}
                      onChange={(e) => setNewResPhone(e.target.value)}
                      placeholder="0901234567"
                      className="text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Số lượng khách</label>
                    <div className="flex gap-1.5">
                      {[2, 4, 6, 8, 10].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setNewResGuests(n)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                            newResGuests === n
                              ? 'bg-amber-500 text-slate-950 border-amber-500'
                              : 'bg-white text-slate-700 border-slate-200'
                          }`}
                        >
                          {n} người
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Gán bàn trước</label>
                    <select
                      aria-label="Chọn bàn đặt trước"
                      value={newResTableId}
                      onChange={(e) => setNewResTableId(e.target.value)}
                      className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs"
                    >
                      <option value="">-- Tự động / Chưa gán bàn --</option>
                      {tables.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.code} - {t.name} ({t.capacity} ghế)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Ngày đến</label>
                    <Input
                      type="date"
                      value={newResDate}
                      onChange={(e) => setNewResDate(e.target.value)}
                      className="text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Giờ đến</label>
                    <Input
                      type="time"
                      value={newResTime}
                      onChange={(e) => setNewResTime(e.target.value)}
                      className="text-xs"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Ghi chú đặc biệt</label>
                  <Input
                    value={newResNotes}
                    onChange={(e) => setNewResNotes(e.target.value)}
                    placeholder="VD: Ghế trẻ em, bàn gần cửa sổ, sinh nhật..."
                    className="text-xs"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={busy}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs cursor-pointer"
                >
                  Xác nhận Tạo lịch đặt bàn
                </Button>
              </form>
            )}
          </div>

          <DialogFooter className="justify-between sm:justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPosTableDialogOpen(false);
                router.push('/admin/tables');
              }}
              className="text-xs font-bold text-amber-800 hover:bg-amber-50 cursor-pointer"
            >
              Mở toàn màn hình Quản lý Bàn & Đặt bàn →
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPosTableDialogOpen(false)}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
