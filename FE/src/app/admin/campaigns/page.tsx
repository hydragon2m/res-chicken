'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  TicketPercent,
  Plus,
  RefreshCw,
  Copy,
  Check,
  Play,
  Pause,
  Sparkles,
  Tag,
} from 'lucide-react';
import { apiRequest } from '@/lib/auth';
import { useActiveStore } from '@/lib/store-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

type Voucher = {
  id: string;
  code: string;
  campaignId: string;
  redemptionQuota: number | null;
  isActive: boolean;
  _count?: {
    redemptions: number;
  };
};

type Campaign = {
  id: string;
  name: string;
  status: 'DRAFT' | 'PUBLISHED' | 'DISABLED';
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue: number;
  maxDiscountAmount?: number | null;
  minOrderAmount?: number;
  redemptionQuota?: number | null;
  startsAt: string;
  endsAt?: string | null;
  vouchers?: Voucher[];
  _count?: {
    vouchers: number;
    redemptions: number;
  };
};

const money = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

const STATUS_BADGES: Record<string, { label: string; cls: string }> = {
  PUBLISHED: {
    label: 'Đang công bố',
    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  DRAFT: {
    label: 'Bản nháp',
    cls: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  DISABLED: {
    label: 'Đã tạm dừng',
    cls: 'bg-slate-100 text-slate-600 border-slate-200',
  },
};

export default function CampaignsPage() {
  const { currentStoreId: storeId, currentStore } = useActiveStore();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Create Campaign Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [name, setName] = useState('');
  const [discountType, setDiscountType] = useState<'PERCENTAGE' | 'FIXED_AMOUNT'>('PERCENTAGE');
  const [discountValue, setDiscountValue] = useState(15);
  const [maxDiscountAmount, setMaxDiscountAmount] = useState<number | undefined>(50000);
  const [minOrderAmount, setMinOrderAmount] = useState<number | undefined>(100000);
  const [publishImmediately, setPublishImmediately] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Generate Vouchers Modal
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [voucherCount, setVoucherCount] = useState(5);
  const [customCodesText, setCustomCodesText] = useState('');
  const [redemptionQuota, setRedemptionQuota] = useState(10);
  const [generating, setGenerating] = useState(false);

  // View Vouchers Drawer/Modal
  const [viewingCampaign, setViewingCampaign] = useState<Campaign | null>(null);
  const [loadError, setLoadError] = useState('');

  const loadCampaigns = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    setLoadError('');
    try {
      const data = await apiRequest<Campaign[]>(
        `/campaigns?storeId=${encodeURIComponent(storeId)}`,
      );
      setCampaigns(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Không thể tải danh sách chiến dịch khuyến mãi.';
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId) return;
    setSubmitting(true);
    try {
      const created = await apiRequest<Campaign>('/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          storeId,
          name: name.trim(),
          discountType,
          discountValue: Number(discountValue),
          maxDiscountAmount:
            discountType === 'PERCENTAGE' && maxDiscountAmount
              ? Number(maxDiscountAmount)
              : undefined,
          minOrderAmount: minOrderAmount ? Number(minOrderAmount) : 0,
          startsAt: new Date(Date.now() - 60_000).toISOString(),
        }),
      });
      if (publishImmediately && created?.id) {
        await apiRequest(`/campaigns/${created.id}/publish`, { method: 'POST' });
      }
      toast.success('Đã tạo chiến dịch khuyến mãi thành công');
      setName('');
      setShowCreateModal(false);
      await loadCampaigns();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Lỗi khi tạo chiến dịch');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (camp: Campaign) => {
    try {
      if (camp.status === 'PUBLISHED') {
        await apiRequest(`/campaigns/${camp.id}/disable`, { method: 'POST' });
        toast.success(`Đã tạm dừng chiến dịch "${camp.name}"`);
      } else {
        await apiRequest(`/campaigns/${camp.id}/publish`, { method: 'POST' });
        toast.success(`Đã công bố chiến dịch "${camp.name}"`);
      }
      await loadCampaigns();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Không thể đổi trạng thái chiến dịch');
    }
  };

  const handleGenerateVouchers = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCampaign) return;
    setGenerating(true);
    try {
      const customCodes = customCodesText
        .split(/[\s,;]+/)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);

      await apiRequest(`/campaigns/${selectedCampaign.id}/vouchers`, {
        method: 'POST',
        body: JSON.stringify({
          quantity: customCodes.length > 0 ? undefined : Number(voucherCount),
          customCodes: customCodes.length > 0 ? customCodes : undefined,
          redemptionQuota: Number(redemptionQuota),
        }),
      });
      toast.success('Đã phát hành mã voucher thành công');
      setCustomCodesText('');
      setSelectedCampaign(null);
      await loadCampaigns();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Lỗi phát hành voucher');
    } finally {
      setGenerating(false);
    }
  };

  const copyVoucher = (code: string) => {
    void navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success(`Đã sao chép mã ${code}`);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const publishedCount = campaigns.filter((c) => c.status === 'PUBLISHED').length;
  const totalVouchers = campaigns.reduce(
    (sum, c) => sum + (c._count?.vouchers ?? c.vouchers?.length ?? 0),
    0,
  );
  const totalRedemptions = campaigns.reduce((sum, c) => sum + (c._count?.redemptions ?? 0), 0);

  return (
    <div className="w-full p-4 sm:p-6 lg:px-8 space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="size-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-sm">
            <TicketPercent className="size-5" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Chiến Dịch Khuyến Mãi & Mã Voucher
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Chi nhánh:{' '}
              <span className="font-semibold text-slate-700">
                {currentStore?.name ?? 'Chick Res Main'}
              </span>{' '}
              • Quản lý chương trình giảm giá, phát hành mã code và kiểm soát lượt sử dụng
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadCampaigns()}
            className="flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </Button>

          <Button
            size="sm"
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold shadow-sm cursor-pointer"
          >
            <Plus className="size-4" />
            <span>Tạo chiến dịch mới</span>
          </Button>
        </div>
      </div>

      {/* Error Banner */}
      {loadError && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium flex items-center justify-between">
          <span>Lỗi đồng bộ dữ liệu: {loadError}</span>
          <Button variant="outline" size="xs" onClick={() => void loadCampaigns()}>
            Thử lại
          </Button>
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="rounded-2xl border-slate-200/90 shadow-2xs">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold text-slate-500 uppercase">
              Tổng chiến dịch
            </CardDescription>
            <CardTitle className="text-2xl font-black text-slate-900 font-mono">
              {campaigns.length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="rounded-2xl border-slate-200/90 shadow-2xs">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold text-slate-500 uppercase">
              Đang công bố (Active)
            </CardDescription>
            <CardTitle className="text-2xl font-black text-emerald-700 font-mono">
              {publishedCount}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="rounded-2xl border-slate-200/90 shadow-2xs">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold text-slate-500 uppercase">
              Tổng mã Voucher đã tạo
            </CardDescription>
            <CardTitle className="text-2xl font-black text-amber-700 font-mono">
              {totalVouchers} mã
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="rounded-2xl border-slate-200/90 shadow-2xs">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold text-slate-500 uppercase">
              Lượt khách đã áp dụng
            </CardDescription>
            <CardTitle className="text-2xl font-black text-slate-900 font-mono">
              {totalRedemptions} lượt
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Structured Campaign Data Table */}
      <Card className="rounded-2xl border-slate-200/90 shadow-2xs overflow-hidden">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-bold text-slate-900">
              Danh sách chiến dịch khuyến mãi ({campaigns.length})
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Bật trạng thái &quot;Đang công bố&quot; để mã voucher có hiệu lực tại quầy POS và QR
              Bàn
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-500 font-bold uppercase text-[11px]">
                <tr>
                  <th className="py-3.5 px-4">Tên chiến dịch</th>
                  <th className="py-3.5 px-4">Mức giảm giá</th>
                  <th className="py-3.5 px-4">Điều kiện đơn</th>
                  <th className="py-3.5 px-4">Mã Voucher (Click để copy)</th>
                  <th className="py-3.5 px-4 text-center">Đã dùng</th>
                  <th className="py-3.5 px-4 text-center">Trạng thái</th>
                  <th className="py-3.5 px-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      Đang tải danh sách chiến dịch khuyến mãi...
                    </td>
                  </tr>
                ) : campaigns.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      Chưa có chiến dịch khuyến mãi nào tại chi nhánh này.
                    </td>
                  </tr>
                ) : (
                  campaigns.map((camp) => {
                    const statusMeta = STATUS_BADGES[camp.status] ?? {
                      label: camp.status,
                      cls: 'bg-slate-100 text-slate-700 border-slate-200',
                    };
                    const vouchers = camp.vouchers ?? [];
                    return (
                      <tr key={camp.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900 text-sm">{camp.name}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Từ: {new Date(camp.startsAt).toLocaleDateString('vi-VN')}
                            {camp.endsAt
                              ? ` → ${new Date(camp.endsAt).toLocaleDateString('vi-VN')}`
                              : ' • Không giới hạn ngày kết thúc'}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 font-mono font-extrabold text-xs">
                            {camp.discountType === 'PERCENTAGE'
                              ? `Giảm ${camp.discountValue}%`
                              : `Giảm ${money.format(camp.discountValue)}`}
                          </span>
                          {camp.discountType === 'PERCENTAGE' && camp.maxDiscountAmount ? (
                            <div className="text-[11px] text-slate-500 mt-1">
                              Tối đa: {money.format(camp.maxDiscountAmount)}
                            </div>
                          ) : null}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-700">
                          {camp.minOrderAmount && camp.minOrderAmount > 0
                            ? `Từ ${money.format(camp.minOrderAmount)}`
                            : 'Mọi đơn hàng'}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex flex-wrap items-center gap-1.5 max-w-[280px]">
                            {vouchers.slice(0, 3).map((v) => (
                              <button
                                key={v.id}
                                type="button"
                                onClick={() => copyVoucher(v.code)}
                                title={`Click để sao chép • Đã dùng ${v._count?.redemptions ?? 0}/${v.redemptionQuota ?? '∞'}`}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-slate-200 hover:border-amber-400 font-mono text-[11px] font-bold text-slate-800 shadow-2xs cursor-pointer"
                              >
                                <Tag className="size-3 text-amber-600" />
                                <span>{v.code}</span>
                                {copiedCode === v.code ? (
                                  <Check className="size-3 text-emerald-600" />
                                ) : (
                                  <Copy className="size-3 text-slate-400" />
                                )}
                              </button>
                            ))}
                            {vouchers.length > 3 && (
                              <button
                                type="button"
                                onClick={() => setViewingCampaign(camp)}
                                className="text-[11px] font-semibold text-amber-700 hover:underline cursor-pointer"
                              >
                                +{vouchers.length - 3} mã khác
                              </button>
                            )}
                            {vouchers.length === 0 && (
                              <span className="text-[11px] text-slate-400 italic">Chưa có mã</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono font-bold text-slate-700">
                          {camp._count?.redemptions ?? 0} lượt
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span
                            className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${statusMeta.cls}`}
                          >
                            {statusMeta.label}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedCampaign(camp)}
                              className="h-8 px-2.5 text-xs font-semibold gap-1 cursor-pointer"
                            >
                              <Sparkles className="size-3.5 text-amber-600" />
                              <span>+ Mã Voucher</span>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void handleToggleStatus(camp)}
                              className={`h-8 px-2.5 text-xs font-semibold gap-1 cursor-pointer ${
                                camp.status === 'PUBLISHED'
                                  ? 'text-slate-600 hover:text-rose-600'
                                  : 'text-emerald-700 border-emerald-200 bg-emerald-50/50 hover:bg-emerald-100'
                              }`}
                            >
                              {camp.status === 'PUBLISHED' ? (
                                <>
                                  <Pause className="size-3.5" />
                                  <span>Tạm dừng</span>
                                </>
                              ) : (
                                <>
                                  <Play className="size-3.5" />
                                  <span>Công bố</span>
                                </>
                              )}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create Campaign Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Tạo Chiến dịch Khuyến mãi Mới</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCampaign} className="space-y-3.5">
              <div className="space-y-1">
                <Label htmlFor="campName" className="text-xs font-semibold text-slate-700">
                  Tên chiến dịch khuyến mãi
                </Label>
                <Input
                  id="campName"
                  placeholder="Ví dụ: Giảm 15% Combo Gà Giòn Vui Vẻ"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Hình thức giảm</Label>
                  <select
                    value={discountType}
                    onChange={(e) =>
                      setDiscountType(e.target.value as 'PERCENTAGE' | 'FIXED_AMOUNT')
                    }
                    className="w-full h-10 px-3 text-sm bg-white border border-slate-200 rounded-lg focus:border-amber-500 outline-none"
                  >
                    <option value="PERCENTAGE">Theo phần trăm (%)</option>
                    <option value="FIXED_AMOUNT">Số tiền cố định (VND)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="discountValue" className="text-xs font-semibold text-slate-700">
                    Giá trị giảm ({discountType === 'PERCENTAGE' ? '%' : 'VND'})
                  </Label>
                  <Input
                    id="discountValue"
                    type="number"
                    min={1}
                    max={discountType === 'PERCENTAGE' ? 100 : undefined}
                    required
                    value={discountValue}
                    onChange={(e) => setDiscountValue(Number(e.target.value))}
                  />
                </div>
              </div>

              {discountType === 'PERCENTAGE' && (
                <div className="space-y-1">
                  <Label htmlFor="maxDiscount" className="text-xs font-semibold text-slate-700">
                    Mức giảm tối đa (VND)
                  </Label>
                  <Input
                    id="maxDiscount"
                    type="number"
                    placeholder="Ví dụ: 50000"
                    value={maxDiscountAmount || ''}
                    onChange={(e) =>
                      setMaxDiscountAmount(e.target.value ? Number(e.target.value) : undefined)
                    }
                  />
                </div>
              )}

              <div className="space-y-1">
                <Label htmlFor="minOrder" className="text-xs font-semibold text-slate-700">
                  Đơn hàng tối thiểu (VND)
                </Label>
                <Input
                  id="minOrder"
                  type="number"
                  placeholder="Ví dụ: 100000"
                  value={minOrderAmount || ''}
                  onChange={(e) =>
                    setMinOrderAmount(e.target.value ? Number(e.target.value) : undefined)
                  }
                />
              </div>

              <label className="flex items-center gap-2 pt-1 text-xs font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={publishImmediately}
                  onChange={(e) => setPublishImmediately(e.target.checked)}
                  className="rounded border-slate-300 text-amber-500 focus:ring-amber-500"
                />
                <span>Công bố kích hoạt ngay sau khi tạo</span>
              </label>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>
                  Huỷ
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="bg-amber-500 hover:bg-amber-600 text-white"
                >
                  {submitting ? 'Đang tạo...' : 'Lưu chiến dịch'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Generate Vouchers Modal */}
      {selectedCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Phát hành Mã Voucher</h3>
                <p className="text-xs text-amber-700 font-semibold truncate max-w-[280px]">
                  Chiến dịch: {selectedCampaign.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCampaign(null)}
                className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGenerateVouchers} className="space-y-3.5">
              <div className="space-y-1">
                <Label htmlFor="customCodes" className="text-xs font-semibold text-slate-700">
                  Mã tự chọn (Không bắt buộc — cách nhau bằng dấu phẩy hoặc khoảng trắng)
                </Label>
                <Input
                  id="customCodes"
                  placeholder="VD: CHICK20, GA2026 (Để trống nếu muốn sinh tự động)"
                  value={customCodesText}
                  onChange={(e) => setCustomCodesText(e.target.value)}
                />
              </div>

              {!customCodesText.trim() && (
                <div className="space-y-1">
                  <Label htmlFor="voucherCount" className="text-xs font-semibold text-slate-700">
                    Số lượng mã tự động cần sinh
                  </Label>
                  <Input
                    id="voucherCount"
                    type="number"
                    min={1}
                    max={100}
                    required
                    value={voucherCount}
                    onChange={(e) => setVoucherCount(Number(e.target.value))}
                  />
                </div>
              )}

              <div className="space-y-1">
                <Label htmlFor="redemptionQuota" className="text-xs font-semibold text-slate-700">
                  Số lượt sử dụng tối đa cho mỗi mã (Quota)
                </Label>
                <Input
                  id="redemptionQuota"
                  type="number"
                  min={1}
                  max={10000}
                  required
                  value={redemptionQuota}
                  onChange={(e) => setRedemptionQuota(Number(e.target.value))}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setSelectedCampaign(null)}>
                  Huỷ
                </Button>
                <Button
                  type="submit"
                  disabled={generating}
                  className="bg-amber-500 hover:bg-amber-600 text-white"
                >
                  {generating ? 'Đang phát hành...' : 'Phát hành ngay'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View All Vouchers of Campaign Modal */}
      {viewingCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Danh sách Voucher ({viewingCampaign.vouchers?.length ?? 0})
                </h3>
                <p className="text-xs text-slate-500">{viewingCampaign.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setViewingCampaign(null)}
                className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                  <tr>
                    <th className="py-2.5 px-3">Mã Voucher</th>
                    <th className="py-2.5 px-3 text-center">Đã dùng / Giới hạn</th>
                    <th className="py-2.5 px-3 text-right">Sao chép</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(viewingCampaign.vouchers ?? []).map((v) => (
                    <tr key={v.id}>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{v.code}</td>
                      <td className="py-2.5 px-3 text-center font-mono">
                        {v._count?.redemptions ?? 0} / {v.redemptionQuota ?? '∞'}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => copyVoucher(v.code)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-50 text-amber-800 font-semibold hover:bg-amber-100 cursor-pointer"
                        >
                          <Copy className="size-3" />
                          <span>Copy</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
