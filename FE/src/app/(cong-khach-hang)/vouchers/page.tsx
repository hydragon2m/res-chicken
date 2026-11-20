'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TicketPercent, Copy, Check, Flame, ArrowRight, Store, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/thanh-phan/giao-dien/card';
import { Badge } from '@/thanh-phan/giao-dien/badge';

type PublicStore = {
  id: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  openingTime?: string;
  closingTime?: string;
};

type PublicCampaign = {
  id: string;
  name: string;
  description?: string;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue: number;
  maxDiscountAmount?: number | null;
  minOrderAmount?: number;
  startsAt: string;
  endsAt?: string;
  vouchers: { code: string }[];
};

const PUBLIC_STORE_STORAGE_KEY = 'chick-res.public-store-id';

const money = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

export default function PublicVouchersPage() {
  const [stores, setStores] = useState<PublicStore[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [campaigns, setCampaigns] = useState<PublicCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    setLoading(true);
    setError('');
    void fetch(`${baseUrl}/api/v1/stores/public`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Không thể tải danh sách chi nhánh.');
        return (await res.json()) as PublicStore[];
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
          list[0]?.id ??
          '';
        setSelectedStoreId(preferred);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Không thể kết nối máy chủ.');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!selectedStoreId) return;
    window.localStorage.setItem(PUBLIC_STORE_STORAGE_KEY, selectedStoreId);
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    setLoading(true);
    setError('');
    void fetch(`${baseUrl}/api/v1/campaigns/public?storeId=${encodeURIComponent(selectedStoreId)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Không thể tải danh sách khuyến mãi của chi nhánh.');
        return (await res.json()) as PublicCampaign[];
      })
      .then((data) => {
        setCampaigns(Array.isArray(data) ? data : []);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Lỗi tải danh sách voucher.');
        setCampaigns([]);
      })
      .finally(() => setLoading(false));
  }, [selectedStoreId]);

  const copyCode = (code: string) => {
    void navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const activeStore = stores.find((s) => s.id === selectedStoreId);

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
              <span className="text-[11px] text-amber-700 font-semibold">Ưu Đãi & Khuyến Mãi</span>
            </div>
          </Link>

          <div className="flex items-center gap-2.5">
            {stores.length > 0 && (
              <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-2xs">
                <Store className="size-3.5 text-amber-600 shrink-0" />
                <select
                  aria-label="Chọn chi nhánh áp dụng khuyến mãi"
                  value={selectedStoreId}
                  onChange={(e) => setSelectedStoreId(e.target.value)}
                  className="text-xs font-bold text-slate-800 bg-transparent focus:outline-none cursor-pointer"
                >
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <Link
              href={
                selectedStoreId
                  ? `/reservations?storeId=${encodeURIComponent(selectedStoreId)}`
                  : '/reservations'
              }
              className="text-xs font-semibold text-amber-700 hover:text-amber-800 bg-amber-100/60 hover:bg-amber-100 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1.5"
            >
              <span>Đặt Bàn Ngay</span>
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>

        {/* Hero */}
        <div className="text-center py-4 space-y-1">
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Kho Voucher Gà Rán Chick Res
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 max-w-lg mx-auto">
            Chi nhánh đang xem:{' '}
            <span className="font-bold text-slate-800">{activeStore?.name ?? 'Chick Res'}</span>
            {activeStore?.address ? ` (${activeStore.address})` : ''} — Thu thập mã giảm giá để áp
            dụng trực tiếp tại quầy hoặc khi quét QR gọi món tại bàn.
          </p>
        </div>

        {error && (
          <div className="rounded-xl bg-rose-50 p-3.5 text-xs text-rose-700 font-medium border border-rose-200 flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Vouchers Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map((camp) => (
            <Card
              key={camp.id}
              className="border border-amber-200/90 bg-white shadow-xs hover:shadow-md transition-all rounded-2xl overflow-hidden relative"
            >
              {/* Golden accent bar on left */}
              <div className="absolute left-0 top-0 bottom-0 w-2 bg-gradient-to-b from-amber-400 to-amber-600" />

              <CardHeader className="pl-6 pr-5 pt-5 pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <Badge variant="amber" className="mb-2">
                      {camp.discountType === 'PERCENTAGE'
                        ? `Giảm ${camp.discountValue}%`
                        : `Giảm ${money.format(camp.discountValue)}`}
                    </Badge>
                    <CardTitle className="text-base font-bold text-slate-900">
                      {camp.name}
                    </CardTitle>
                  </div>
                  <TicketPercent className="size-7 text-amber-500/40" />
                </div>
                {camp.description && (
                  <CardDescription className="text-xs text-slate-500">
                    {camp.description}
                  </CardDescription>
                )}
              </CardHeader>

              <CardContent className="pl-6 pr-5 pb-5 pt-0 space-y-3">
                <div className="text-[11px] text-slate-500 space-y-0.5">
                  {camp.minOrderAmount ? (
                    <p>
                      • Đơn tối thiểu:{' '}
                      <span className="font-semibold text-slate-700">
                        {money.format(camp.minOrderAmount)}
                      </span>
                    </p>
                  ) : null}
                  {camp.maxDiscountAmount ? (
                    <p>
                      • Giảm tối đa:{' '}
                      <span className="font-semibold text-slate-700">
                        {money.format(camp.maxDiscountAmount)}
                      </span>
                    </p>
                  ) : null}
                </div>

                {/* Available Codes */}
                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Mã áp dụng:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {camp.vouchers.map((v) => (
                      <button
                        key={v.code}
                        type="button"
                        onClick={() => copyCode(v.code)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-300 text-xs font-mono font-bold text-amber-900 hover:bg-amber-100 transition-colors cursor-pointer"
                      >
                        <span>{v.code}</span>
                        {copiedCode === v.code ? (
                          <Check className="size-3 text-emerald-600" />
                        ) : (
                          <Copy className="size-3 text-amber-700" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {campaigns.length === 0 && !loading && !error && (
            <div className="col-span-full p-12 text-center bg-white border border-slate-200 rounded-2xl space-y-3">
              <TicketPercent className="size-12 mx-auto text-slate-300" />
              <h3 className="text-base font-bold text-slate-700">
                Hiện chưa có khuyến mãi công khai tại chi nhánh này
              </h3>
              <p className="text-xs text-slate-400">
                Quý khách có thể chọn chi nhánh khác ở góc trên hoặc quay lại sau để cập nhật ưu đãi
                mới nhất!
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
