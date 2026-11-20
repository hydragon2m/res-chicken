'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CalendarDays,
  Users,
  Clock,
  CheckCircle2,
  AlertCircle,
  Flame,
  ArrowRight,
  Sparkles,
  Store,
} from 'lucide-react';
import { Button } from '@/thanh-phan/giao-dien/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/thanh-phan/giao-dien/card';
import { Input } from '@/thanh-phan/giao-dien/input';
import { Label } from '@/thanh-phan/giao-dien/label';

type PublicStore = {
  id: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  openingTime?: string;
  closingTime?: string;
};

const PUBLIC_STORE_STORAGE_KEY = 'chick-res.public-store-id';

export default function PublicReservationsPage() {
  const [stores, setStores] = useState<PublicStore[]>([]);
  const [storeId, setStoreId] = useState(process.env.NEXT_PUBLIC_PUBLIC_STORE_ID ?? '');
  const [partySize, setPartySize] = useState(2);
  const [date, setDate] = useState('2026-11-04');
  const [time, setTime] = useState('18:30');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');

  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [successBooking, setSuccessBooking] = useState<{
    reservationId: string;
    customerName: string;
    reservationTime: string;
  } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => setDate(new Date().toISOString().split('T')[0]), []);

  useEffect(() => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    void fetch(`${baseUrl}/api/v1/stores/public`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Không thể tải danh sách chi nhánh nhà hàng.');
        return (await response.json()) as PublicStore[];
      })
      .then((list) => {
        setStores(list);
        const params = new URLSearchParams(window.location.search);
        const queryStoreId = params.get('storeId');
        const savedStoreId =
          window.localStorage.getItem(PUBLIC_STORE_STORAGE_KEY) ||
          window.localStorage.getItem('chick-res.active-store-id');
        const preferred =
          list.find((s) => s.id === queryStoreId)?.id ??
          list.find((s) => s.id === savedStoreId)?.id ??
          (storeId && list.find((s) => s.id === storeId)?.id) ??
          list[0]?.id ??
          '';
        setStoreId(preferred);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Không thể kết nối máy chủ đặt bàn.');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectStore = (nextId: string) => {
    setStoreId(nextId);
    setAvailable(null);
    window.localStorage.setItem(PUBLIC_STORE_STORAGE_KEY, nextId);
  };

  const activeStore = stores.find((s) => s.id === storeId);

  const checkAvailability = async () => {
    if (!storeId) {
      setError('Vui lòng chọn chi nhánh nhà hàng trước khi kiểm tra chỗ trống.');
      return;
    }
    setChecking(true);
    setError('');
    setAvailable(null);
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const res = await fetch(
        `${baseUrl}/api/v1/reservations/public/availability?storeId=${encodeURIComponent(storeId)}&date=${encodeURIComponent(date)}&guestCount=${partySize}`,
      );
      if (!res.ok) throw new Error('Không thể kiểm tra chỗ trống.');
      const data = await res.json();
      const slot = data.slots?.find((item: { time: string }) => item.time === time);
      const isAvailable = Boolean(slot?.available);
      setAvailable(isAvailable);
      if (!isAvailable) {
        setError(
          data.reason ||
            'Khung giờ này đã kín chỗ hoặc nhà hàng đã đóng cửa. Quý khách vui lòng chọn khung giờ khác.',
        );
      }
    } catch (err) {
      setAvailable(false);
      setError(err instanceof Error ? err.message : 'Không thể kiểm tra chỗ trống.');
    } finally {
      setChecking(false);
    }
  };

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId) {
      setError('Nhà hàng hiện chưa sẵn sàng nhận đặt bàn.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const reservationTime = new Date(`${date}T${time}:00`).toISOString();
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const res = await fetch(`${baseUrl}/api/v1/reservations/public`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          customerName: name,
          customerPhone: phone,
          customerEmail: email || undefined,
          guestCount: Number(partySize),
          reservationTime,
          specialNotes: notes || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.message || 'Không thể đặt bàn vào giờ này. Vui lòng thử lại.');
      }

      const booked = await res.json();
      setSuccessBooking(booked);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra khi đặt bàn');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50/50 via-slate-50 to-slate-100 font-sans px-4 sm:px-8 lg:px-12 py-6">
      <div className="w-full space-y-6">
        {/* Brand Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200">
          <Link href="/" className="flex items-center gap-2">
            <div className="size-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-sm shadow-amber-500/30">
              <Flame className="size-5 fill-current" />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-slate-900 tracking-tight leading-none">
                Chick Res
              </h1>
              <span className="text-[11px] text-amber-700 font-semibold">Gà Rán Giòn Rụm</span>
            </div>
          </Link>

          <Link
            href={storeId ? `/vouchers?storeId=${encodeURIComponent(storeId)}` : '/vouchers'}
            className="text-xs font-semibold text-amber-700 hover:text-amber-800 bg-amber-100/60 hover:bg-amber-100 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1.5"
          >
            <Sparkles className="size-3.5" />
            <span>Xem Mã Giảm Giá</span>
          </Link>
        </div>

        {/* Confirmation Screen */}
        {successBooking ? (
          <Card className="border border-emerald-200 bg-white shadow-xl rounded-2xl overflow-hidden p-8 text-center space-y-5">
            <div className="size-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="size-10" />
            </div>

            <div className="space-y-1">
              <h2 className="text-2xl font-black text-slate-900">Đặt Bàn Thành Công!</h2>
              <p className="text-sm text-slate-600">
                Cảm ơn quý khách{' '}
                <span className="font-bold text-slate-900">{successBooking.customerName}</span>.
                Nhân viên Chick Res ({activeStore?.name ?? 'Chi nhánh'}) sẽ liên hệ xác nhận trong
                ít phút.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 max-w-sm mx-auto text-xs space-y-2 text-left font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400 font-sans">Chi nhánh:</span>
                <span className="font-bold text-slate-900 font-sans">
                  {activeStore?.name ?? 'Chick Res'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-sans">Mã đặt bàn:</span>
                <span className="font-bold text-slate-900">
                  {successBooking.reservationId.substring(0, 8).toUpperCase()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-sans">Thời gian:</span>
                <span className="font-bold text-amber-700">
                  {new Date(successBooking.reservationTime).toLocaleTimeString('vi-VN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  - {new Date(successBooking.reservationTime).toLocaleDateString('vi-VN')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-sans">Số lượng khách:</span>
                <span className="font-bold text-slate-900">{partySize} người</span>
              </div>
            </div>

            <div className="pt-4 flex justify-center gap-3">
              <Button
                onClick={() => setSuccessBooking(null)}
                className="bg-amber-500 hover:bg-amber-600 text-white"
              >
                Đặt thêm bàn khác
              </Button>
              <Link href="/">
                <Button variant="outline">Trở về Trang chủ</Button>
              </Link>
            </div>
          </Card>
        ) : (
          /* Booking Form */
          <Card className="border border-slate-200/90 shadow-xl bg-white rounded-2xl overflow-hidden">
            <CardHeader className="text-center pb-4 pt-6 bg-gradient-to-b from-amber-50/50 to-transparent">
              <CardTitle className="text-2xl font-extrabold text-slate-900">
                Đặt Bàn Trước Trực Tuyến
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Chọn chi nhánh, khung giờ và số lượng khách để giữ chỗ nhanh chóng
              </CardDescription>
            </CardHeader>

            <CardContent className="p-6 sm:p-8 space-y-6">
              {error && (
                <div className="rounded-xl bg-red-50 p-3.5 text-xs text-red-700 font-medium border border-red-200 flex items-start gap-2">
                  <AlertCircle className="size-4 shrink-0 mt-0.5 text-red-600" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleBook} className="space-y-5">
                {/* Step 0: Select Store Branch */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <Store className="size-3.5 text-amber-600" />
                    <span>Chi nhánh nhà hàng *</span>
                  </Label>
                  <select
                    aria-label="Chọn chi nhánh nhà hàng"
                    required
                    value={storeId}
                    onChange={(e) => handleSelectStore(e.target.value)}
                    className="w-full h-10 px-3 text-sm font-semibold bg-white border border-slate-200 rounded-lg focus:border-amber-500 outline-none"
                  >
                    {stores.length === 0 ? (
                      <option value="">Đang tải danh sách chi nhánh...</option>
                    ) : (
                      stores.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                          {s.address ? ` — ${s.address}` : ''}
                          {s.openingTime && s.closingTime
                            ? ` (${s.openingTime} - ${s.closingTime})`
                            : ''}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {/* Step 1: Party size & Date/time */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                      <Users className="size-3.5 text-amber-600" />
                      <span>Số khách</span>
                    </Label>
                    <select
                      value={partySize}
                      onChange={(e) => {
                        setPartySize(Number(e.target.value));
                        setAvailable(null);
                      }}
                      className="w-full h-10 px-3 text-sm bg-white border border-slate-200 rounded-lg focus:border-amber-500 outline-none"
                    >
                      {[1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20].map((n) => (
                        <option key={n} value={n}>
                          {n} khách
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                      <CalendarDays className="size-3.5 text-amber-600" />
                      <span>Ngày dùng bữa</span>
                    </Label>
                    <Input
                      type="date"
                      value={date}
                      onChange={(e) => {
                        setDate(e.target.value);
                        setAvailable(null);
                      }}
                      className="h-10 text-sm"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                      <Clock className="size-3.5 text-amber-600" />
                      <span>Giờ đến</span>
                    </Label>
                    <Input
                      type="time"
                      value={time}
                      onChange={(e) => {
                        setTime(e.target.value);
                        setAvailable(null);
                      }}
                      className="h-10 text-sm"
                      required
                    />
                  </div>
                </div>

                {/* Check availability status */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200/70">
                  <span className="text-xs text-slate-600">
                    {available === true
                      ? '✓ Còn bàn trống cho số lượng khách này!'
                      : 'Kiểm tra tình trạng bàn trước khi hoàn tất'}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={checkAvailability}
                    disabled={checking || !storeId}
                    className="text-xs font-semibold"
                  >
                    {checking ? 'Đang kiểm tra...' : 'Kiểm tra chỗ trống'}
                  </Button>
                </div>

                {/* Step 2: Customer Contact Info */}
                <div className="space-y-3.5 pt-2 border-t border-slate-100">
                  <div className="space-y-1.5">
                    <Label htmlFor="custName" className="text-xs font-semibold text-slate-700">
                      Họ tên quý khách *
                    </Label>
                    <Input
                      id="custName"
                      placeholder="Ví dụ: Nguyễn Văn A"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="h-10 text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="custPhone" className="text-xs font-semibold text-slate-700">
                        Số điện thoại liên hệ *
                      </Label>
                      <Input
                        id="custPhone"
                        type="tel"
                        placeholder="0912 345 678"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="h-10 text-sm font-mono"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="custEmail" className="text-xs font-semibold text-slate-700">
                        Email (nhận xác nhận)
                      </Label>
                      <Input
                        id="custEmail"
                        type="email"
                        placeholder="email@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="h-10 text-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="custNotes" className="text-xs font-semibold text-slate-700">
                      Yêu cầu đặc biệt (ghế trẻ em, sinh nhật, sốt không cay...)
                    </Label>
                    <Input
                      id="custNotes"
                      placeholder="Ghi chú thêm cho nhà hàng..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="h-10 text-sm"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  size="lg"
                  disabled={submitting || !storeId}
                  className="w-full h-11 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg shadow-md shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  {submitting ? (
                    'Đang xử lý đặt bàn...'
                  ) : (
                    <>
                      <span>Xác nhận Đặt bàn ngay</span>
                      <ArrowRight className="size-4" />
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
