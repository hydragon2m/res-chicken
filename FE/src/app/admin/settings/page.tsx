'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Store,
  Phone,
  MapPin,
  Clock,
  Receipt,
  CheckCircle2,
  AlertCircle,
  Save,
  RefreshCw,
} from 'lucide-react';
import { apiRequest } from '@/lib/auth';
import { useActiveStore } from '@/lib/store-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type StoreSettings = {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  taxRate: number;
  taxCode?: string;
  receiptHeader?: string;
  receiptFooter?: string;
  openingTime: string;
  closingTime: string;
};

export default function StoreSettingsPage() {
  const { currentStoreId: storeId, currentStore } = useActiveStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [taxPercent, setTaxPercent] = useState(8);
  const [taxCode, setTaxCode] = useState('');
  const [receiptHeader, setReceiptHeader] = useState('');
  const [receiptFooter, setReceiptFooter] = useState('');
  const [openingTime, setOpeningTime] = useState('08:00');
  const [closingTime, setClosingTime] = useState('22:00');

  const loadSettings = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiRequest<StoreSettings>(`/settings/store/${storeId}`);
      setPhone(data.phone || '');
      setAddress(data.address || '');
      setTaxPercent(Math.round(data.taxRate * 100));
      setTaxCode(data.taxCode || '');
      setReceiptHeader(data.receiptHeader || '');
      setReceiptFooter(data.receiptFooter || '');
      setOpeningTime(data.openingTime || '08:00');
      setClosingTime(data.closingTime || '22:00');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi tải cấu hình');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId) return;
    setSaving(true);
    setSuccess(false);
    setError('');
    try {
      await apiRequest(`/settings/store/${storeId}`, {
        method: 'PUT',
        body: JSON.stringify({
          phone: phone || undefined,
          address: address || undefined,
          taxRate: taxPercent / 100,
          taxCode: taxCode || undefined,
          receiptHeader: receiptHeader || undefined,
          receiptFooter: receiptFooter || undefined,
          openingTime,
          closingTime,
        }),
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi lưu cấu hình');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full p-4 sm:p-6 lg:px-8 space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Cài đặt Vận hành Cửa hàng
          </h1>
          <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5 font-medium">
            <span className="size-2 rounded-full bg-amber-500" />
            <span>
              Chi nhánh: {currentStore?.name ?? 'Chick Res'} • Thuế VAT, Giờ mở cửa, Mẫu hóa đơn
            </span>
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={loadSettings}
          className="flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
        >
          <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Tải lại</span>
        </Button>
      </div>

      {success && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium flex items-center gap-2">
          <CheckCircle2 className="size-4 text-emerald-600" />
          <span>Đã lưu thành công cấu hình chi nhánh!</span>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium flex items-center gap-2">
          <AlertCircle className="size-4 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
          {/* Contact Info Card */}
          <Card className="border-slate-200 shadow-2xs h-full">
          <CardHeader className="pb-3 pt-5 px-6">
            <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Store className="size-4.5 text-amber-600" />
              <span>Thông tin liên hệ & Địa chỉ</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Xuất hiện trên hóa đơn thanh toán cho khách hàng
            </CardDescription>
          </CardHeader>

          <CardContent className="px-6 pb-6 pt-2 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="storePhone" className="text-xs font-semibold text-slate-700">
                  Hotline / Số điện thoại
                </Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                  <Input
                    id="storePhone"
                    placeholder="028 1234 5678"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="pl-9 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="taxCode" className="text-xs font-semibold text-slate-700">
                  Mã số thuế (MST)
                </Label>
                <Input
                  id="taxCode"
                  placeholder="0312345678"
                  value={taxCode}
                  onChange={(e) => setTaxCode(e.target.value)}
                  className="text-sm font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="storeAddress" className="text-xs font-semibold text-slate-700">
                Địa chỉ chi nhánh
              </Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                <Input
                  id="storeAddress"
                  placeholder="Số 123 Đường Nguyễn Trãi, Quận 1, TP. HCM"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="pl-9 text-sm"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Operating Hours & VAT Card */}
        <Card className="border-slate-200 shadow-2xs">
          <CardHeader className="pb-3 pt-5 px-6">
            <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Clock className="size-4.5 text-amber-600" />
              <span>Giờ mở cửa & Thuế VAT</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Kiểm soát slot đặt bàn và thuế suất tự động tính trên hóa đơn
            </CardDescription>
          </CardHeader>

          <CardContent className="px-6 pb-6 pt-2 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="openTime" className="text-xs font-semibold text-slate-700">
                  Giờ mở cửa (HH:mm)
                </Label>
                <Input
                  id="openTime"
                  type="time"
                  value={openingTime}
                  onChange={(e) => setOpeningTime(e.target.value)}
                  className="text-sm"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="closeTime" className="text-xs font-semibold text-slate-700">
                  Giờ đóng cửa (HH:mm)
                </Label>
                <Input
                  id="closeTime"
                  type="time"
                  value={closingTime}
                  onChange={(e) => setClosingTime(e.target.value)}
                  className="text-sm"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="taxPercent" className="text-xs font-semibold text-slate-700">
                  Thuế suất VAT (%)
                </Label>
                <div className="relative">
                  <Input
                    id="taxPercent"
                    type="number"
                    min={0}
                    max={30}
                    value={taxPercent}
                    onChange={(e) => setTaxPercent(Number(e.target.value))}
                    className="pr-8 text-sm"
                    required
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    %
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Receipt Template Card */}
        <Card className="border-slate-200 shadow-2xs xl:col-span-2">
          <CardHeader className="pb-3 pt-5 px-6">
            <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Receipt className="size-4.5 text-amber-600" />
              <span>Tiêu đề & Chân trang Hóa đơn</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Thông điệp in ấn gửi tới khách hàng
            </CardDescription>
          </CardHeader>

          <CardContent className="px-6 pb-6 pt-2 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="receiptHeader" className="text-xs font-semibold text-slate-700">
                Tiêu đề hóa đơn (Header)
              </Label>
              <Input
                id="receiptHeader"
                placeholder="CHICK RES - GÀ RÁN GIÒN RỤM SỐ 1"
                value={receiptHeader}
                onChange={(e) => setReceiptHeader(e.target.value)}
                className="text-sm uppercase font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="receiptFooter" className="text-xs font-semibold text-slate-700">
                Lời cảm ơn chân trang (Footer)
              </Label>
              <Input
                id="receiptFooter"
                placeholder="Cảm ơn quý khách và hẹn gặp lại! Hotline: 1900 xxxx"
                value={receiptFooter}
                onChange={(e) => setReceiptFooter(e.target.value)}
                className="text-sm"
              />
            </div>
          </CardContent>
        </Card>
        </div>

        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            disabled={saving}
            className="bg-amber-500 hover:bg-amber-600 text-white font-bold h-11 px-6 shadow-md shadow-amber-500/20 flex items-center gap-2 cursor-pointer"
          >
            <Save className="size-4" />
            <span>{saving ? 'Đang lưu...' : 'Lưu cài đặt chi nhánh'}</span>
          </Button>
        </div>
      </form>
    </div>
  );
}
