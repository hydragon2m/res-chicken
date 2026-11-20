'use client';

import { CircleAlert, Clock3, PackageCheck, RefreshCw, Flame, ArrowRight, Ban } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Badge } from '@/thanh-phan/giao-dien/badge';
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
import { toast } from 'sonner';
import { ApiError, apiRequest, getActor, type Actor } from '@/thu-vien/auth';
import { useActiveStore } from '@/thu-vien/store-context';

type TicketStatus = 'QUEUED' | 'PREPARING' | 'READY' | 'HANDED_OVER' | 'VOIDED';
type TicketItem = {
  id: string;
  productName: string;
  variantName: string;
  quantity: number;
  optionsSnapshot: { name: string }[];
};
type Ticket = {
  id: string;
  status: TicketStatus;
  priority: number;
  queuedAt: string;
  items: TicketItem[];
  order: { id: string };
};
type Station = 'frying' | 'packing';

const stationCopy: Record<
  Station,
  {
    eyebrow: string;
    title: string;
    statuses: TicketStatus[];
    next: Partial<Record<TicketStatus, { label: string; status: TicketStatus }>>;
  }
> = {
  frying: {
    eyebrow: 'Trạm chiên mẻ & Chế biến',
    title: 'Bếp Chiên Gà',
    statuses: ['QUEUED', 'PREPARING'],
    next: {
      QUEUED: { label: 'Nhận làm mẻ này', status: 'PREPARING' },
      PREPARING: { label: '✓ Xong mẻ (Sẵn sàng)', status: 'READY' },
    },
  },
  packing: {
    eyebrow: 'Trạm kiểm tra & Đóng gói',
    title: 'Đóng Gói & Bàn Giao',
    statuses: ['READY'],
    next: { READY: { label: '✓ Đã giao cho khách', status: 'HANDED_OVER' } },
  },
};

function elapsedSeconds(from: string, now: number) {
  if (!now) return 0;
  return Math.max(0, Math.floor((now - new Date(from).getTime()) / 1000));
}

function elapsedFormatted(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}g ${minutes % 60}p`
    : `${minutes}p ${seconds % 60}s`;
}

function statusConfig(status: TicketStatus) {
  return {
    QUEUED: { label: 'Chờ chiên', bg: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
    PREPARING: { label: 'Đang chiên', bg: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
    READY: {
      label: 'Chờ đóng gói',
      bg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    },
    HANDED_OVER: { label: 'Đã giao', bg: 'bg-slate-500/15 text-slate-400 border-slate-500/30' },
    VOIDED: { label: 'Đã dừng', bg: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
  }[status];
}

export function KdsWorkspace({ station }: { station: Station }) {
  const router = useRouter();
  const copy = stationCopy[station];
  const { currentStoreId: storeId, currentStore } = useActiveStore();
  const [actor, setActor] = useState<Actor | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [accessDenied, setAccessDenied] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [voiding, setVoiding] = useState<Ticket | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async (id: string) => {
    if (!id) return;
    try {
      const next = await apiRequest<Ticket[]>(`/fulfillment/tickets?storeId=${id}`);
      setTickets(next);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void getActor()
      .then(async (nextActor) => {
        setActor(nextActor);
        if (!nextActor.permissions.includes('fulfillment.read')) {
          setAccessDenied(true);
          return;
        }
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) router.replace('/login');
        else setAccessDenied(true);
      });
  }, [router]);

  useEffect(() => {
    if (!storeId || !actor?.permissions.includes('fulfillment.read')) return;
    void load(storeId);

    // Realtime Server-Sent Events (SSE) for instant zero-latency updates via single-use ticket
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    let sse: EventSource | null = null;
    let isCancelled = false;

    void (async () => {
      try {
        const { ticket } = await apiRequest<{ ticket: string }>('/events/ticket', {
          method: 'POST',
        });
        if (isCancelled) return;
        const sseUrl = `${baseUrl}/api/v1/events?storeId=${storeId}&ticket=${encodeURIComponent(ticket)}`;
        sse = new EventSource(sseUrl);
        sse.onmessage = (event) => {
          try {
            const parsed = JSON.parse(event.data);
            if (parsed?.type?.startsWith('order.') || parsed?.type?.startsWith('ticket.')) {
              void load(storeId);
            }
          } catch {
            // ignore
          }
        };
      } catch {
        // Fallback to polling
      }
    })();

    const interval = window.setInterval(() => {
      void load(storeId);
    }, 15000);

    return () => {
      isCancelled = true;
      if (sse) sse.close();
      window.clearInterval(interval);
    };
  }, [storeId, actor, load]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const refresh = () => {
    if (storeId) void load(storeId);
  };

  const advance = async (ticket: Ticket) => {
    const target = copy.next[ticket.status]?.status;
    if (!target) return;
    setBusyId(ticket.id);
    try {
      await apiRequest<Ticket>(`/fulfillment/tickets/${ticket.id}/transition`, {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ status: target }),
      });
      if (storeId) await load(storeId);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'Không thể chuyển trạng thái ticket.',
      );
    } finally {
      setBusyId(null);
    }
  };

  const submitVoid = async () => {
    if (!voiding) return;
    setBusyId(voiding.id);
    try {
      await apiRequest<Ticket>(`/fulfillment/tickets/${voiding.id}/transition`, {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ status: 'VOIDED', note: voidReason.trim() }),
      });
      setVoiding(null);
      setVoidReason('');
      if (storeId) await load(storeId);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Không thể dừng ticket.');
    } finally {
      setBusyId(null);
    }
  };

  const visible = useMemo(
    () => tickets.filter((ticket) => copy.statuses.includes(ticket.status)),
    [copy.statuses, tickets],
  );

  const queuedCount = tickets.filter((t) => t.status === 'QUEUED').length;
  const preparingCount = tickets.filter((t) => t.status === 'PREPARING').length;
  const readyCount = tickets.filter((t) => t.status === 'READY').length;

  if (accessDenied) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-zinc-400">
        <CircleAlert className="size-8 text-rose-500" />
        <p>Tài khoản của bạn không có quyền xem Màn hình bếp (KDS).</p>
      </div>
    );
  }

  if (!actor) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-zinc-400 gap-3">
        <RefreshCw className="size-7 animate-spin text-orange-500" />
        <p className="text-sm font-medium">Đang kết nối màn hình điều phối bếp…</p>
      </div>
    );
  }

  const canManage = actor.permissions.includes('fulfillment.manage');
  const destination = station === 'frying' ? '/kds/packing' : '/kds/frying';
  const destinationText = station === 'frying' ? 'Sang trạm đóng gói' : 'Sang trạm bếp chiên';

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      {/* Top KDS Control Header */}
      <div className="h-16 bg-zinc-900 border-b border-zinc-800 px-6 flex items-center justify-between shrink-0 shadow-md">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-gradient-to-tr from-orange-600 to-amber-500 flex items-center justify-center text-white shadow-lg shadow-orange-600/30">
            <Flame className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white tracking-tight">{copy.title}</h1>
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">
                {currentStore?.name ?? 'Chi nhánh'}
              </span>
            </div>
            <p className="text-xs text-zinc-400">{copy.eyebrow} • Tự động đồng bộ mỗi 10s</p>
          </div>
        </div>

        {/* Live Counters & Station Switcher */}
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-4 px-4 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-500 font-medium">Chờ nhận:</span>
              <span className="font-bold text-amber-400 font-mono text-sm">{queuedCount}</span>
            </div>
            <div className="text-zinc-700">|</div>
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-500 font-medium">Đang làm:</span>
              <span className="font-bold text-orange-400 font-mono text-sm">{preparingCount}</span>
            </div>
            <div className="text-zinc-700">|</div>
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-500 font-medium">Sẵn sàng:</span>
              <span className="font-bold text-emerald-400 font-mono text-sm">{readyCount}</span>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700 text-xs gap-1.5"
          >
            <RefreshCw className="size-3.5" />
            <span>Làm mới</span>
          </Button>

          <Button
            asChild
            size="sm"
            className="bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold gap-1.5 shadow-xs"
          >
            <Link href={destination}>
              <span>{destinationText}</span>
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Main KDS Tickets Board */}
      <div className="flex-1 p-6 overflow-y-auto">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[65vh] text-center space-y-3">
            <div className="size-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-600">
              <PackageCheck className="size-8 text-emerald-500" />
            </div>
            <h2 className="text-lg font-bold text-white">Không có ticket nào đang chờ xử lý</h2>
            <p className="text-xs text-zinc-400 max-w-sm">
              Tất cả các món đã được hoàn tất hoặc chuyển sang trạm tiếp theo. Đơn mới sẽ xuất hiện
              ngay tại đây.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
            {visible.map((ticket) => {
              const seconds = elapsedSeconds(ticket.queuedAt, now);
              const formattedTime = elapsedFormatted(seconds);
              const statusCfg = statusConfig(ticket.status);
              const nextAction = copy.next[ticket.status];

              // Alert level based on elapsed wait time
              const isUrgent = seconds > 600; // > 10 mins
              const isWarning = seconds > 300 && !isUrgent; // > 5 mins

              return (
                <div
                  key={ticket.id}
                  className={`flex flex-col justify-between rounded-2xl border bg-zinc-900/90 shadow-xl overflow-hidden transition-all duration-200 ${
                    isUrgent
                      ? 'border-rose-500 ring-2 ring-rose-500/20'
                      : isWarning
                        ? 'border-amber-500/80'
                        : 'border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  {/* Ticket Header */}
                  <div className="p-4 border-b border-zinc-800/80 bg-zinc-900">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xl font-black text-white tracking-wider">
                          #{ticket.order.id.slice(0, 8).toUpperCase()}
                        </span>
                        {ticket.priority > 0 && (
                          <Badge className="bg-rose-500 text-white font-bold text-[10px]">
                            GẤP
                          </Badge>
                        )}
                      </div>

                      {/* Timer Pill */}
                      <div
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-bold ${
                          isUrgent
                            ? 'bg-rose-500/20 text-rose-400 animate-pulse'
                            : isWarning
                              ? 'bg-amber-500/20 text-amber-400'
                              : 'bg-zinc-800 text-zinc-300'
                        }`}
                      >
                        <Clock3 className="size-3.5" />
                        <span>{formattedTime}</span>
                      </div>
                    </div>

                    <div className="mt-2 flex items-center justify-between">
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${statusCfg.bg}`}
                      >
                        {statusCfg.label}
                      </span>
                      <time className="text-[10px] text-zinc-500 font-mono">
                        Vào bếp:{' '}
                        {new Date(ticket.queuedAt).toLocaleTimeString('vi-VN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </time>
                    </div>
                  </div>

                  {/* Items List */}
                  <div className="p-4 flex-1 space-y-3 overflow-y-auto max-h-72">
                    {ticket.items.map((item) => (
                      <div key={item.id} className="flex items-start gap-2.5 text-zinc-200">
                        <span className="size-7 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center font-mono font-black text-sm text-orange-400 shrink-0">
                          {item.quantity}×
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-white leading-tight">
                            {item.productName}
                          </p>
                          <p className="text-xs text-zinc-400 mt-0.5">{item.variantName}</p>
                          {item.optionsSnapshot.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {item.optionsSnapshot.map((opt, i) => (
                                <span
                                  key={i}
                                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-orange-950/60 border border-orange-800/40 text-orange-300"
                                >
                                  {opt.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Big Action Button for Kitchen Staff */}
                  <div className="p-3 bg-zinc-950/70 border-t border-zinc-800/80 space-y-2">
                    {nextAction && canManage && (
                      <Button
                        size="lg"
                        disabled={busyId === ticket.id}
                        onClick={() => void advance(ticket)}
                        className={`w-full h-12 font-bold text-sm tracking-wide shadow-md transition-all cursor-pointer ${
                          ticket.status === 'PREPARING'
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30'
                            : 'bg-orange-600 hover:bg-orange-500 text-white shadow-orange-600/30'
                        }`}
                      >
                        {busyId === ticket.id ? (
                          <RefreshCw className="size-4 animate-spin" />
                        ) : (
                          <span>{nextAction.label}</span>
                        )}
                      </Button>
                    )}

                    {canManage && (
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => setVoiding(ticket)}
                        className="w-full text-zinc-500 hover:text-rose-400 text-[11px]"
                      >
                        Dừng / Báo huỷ ticket
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Void Dialog */}
      {voiding && (
        <Dialog open={!!voiding} onOpenChange={(open) => !open && setVoiding(null)}>
          <DialogContent className="max-w-sm bg-zinc-900 border-zinc-800 text-white">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-rose-400 flex items-center gap-2">
                <Ban className="size-4 text-rose-500" />
                <span>Dừng ticket #{voiding.order.id.slice(0, 8)}</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-zinc-400">
                Nhập lý do dừng ticket chế biến (cháy mẻ, hết nguyên liệu...).
              </DialogDescription>
            </DialogHeader>
            <div className="py-2">
              <Input
                placeholder="Lý do bắt buộc..."
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-white placeholder-zinc-500"
              />
            </div>
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setVoiding(null)}
                className="border-zinc-700 text-zinc-300"
              >
                Bỏ qua
              </Button>
              <Button
                size="sm"
                disabled={!voidReason.trim() || busyId === voiding.id}
                onClick={() => void submitVoid()}
                className="bg-rose-600 hover:bg-rose-700 text-white font-semibold"
              >
                Xác nhận dừng
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
