'use client';

import { useState, useMemo, type FormEvent } from 'react';
import Link from 'next/link';
import { Building2, Plus, Phone, Mail, ArrowDownToLine, Search } from 'lucide-react';
import { Button } from '@/thanh-phan/giao-dien/button';
import { Input } from '@/thanh-phan/giao-dien/input';
import { apiRequest } from '@/thu-vien/auth';
import type { Supplier } from '@/tinh-nang/kho-nguyen-lieu/types';

interface SuppliersViewProps {
  storeId: string;
  suppliers: Supplier[];
  busy: boolean;
  run: (operation: () => Promise<void>, successMessage?: string) => Promise<void>;
}

export function SuppliersView({ storeId, suppliers, busy, run }: SuppliersViewProps) {
  const [supName, setSupName] = useState('');
  const [supPhone, setSupPhone] = useState('');
  const [supNote, setSupNote] = useState('');
  const [search, setSearch] = useState('');

  const filteredSuppliers = useMemo(() => {
    if (!search.trim()) return suppliers;
    const q = search.trim().toLowerCase();
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.phone && s.phone.includes(q)) ||
        (s.note && s.note.toLowerCase().includes(q)),
    );
  }, [suppliers, search]);

  const submitSupplier = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(async () => {
      await apiRequest('/inventory/suppliers', {
        method: 'POST',
        body: JSON.stringify({
          storeId,
          name: supName.trim(),
          phone: supPhone.trim() || undefined,
          note: supNote.trim() || undefined,
        }),
      });
      setSupName('');
      setSupPhone('');
      setSupNote('');
    }, 'Đã lưu thông tin nhà cung cấp thành công!');
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Add Supplier Form */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-6 space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Building2 className="size-5 text-emerald-600" />
              <span>Thêm Nhà Cung Cấp Mới</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Khai báo đối tác cung ứng thịt tươi, gia vị, bao bì để gắn vào các đợt nhập hàng theo lô
            </p>
          </div>

          <form onSubmit={submitSupplier} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">
                Tên đơn vị / Nhà cung ứng <span className="text-rose-500">*</span>
              </label>
              <Input
                required
                value={supName}
                onChange={(e) => setSupName(e.target.value)}
                placeholder="Ví dụ: Công ty CP Thực phẩm CP, Tân Hiệp Phát..."
                className="h-10 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Số điện thoại liên hệ</label>
              <Input
                value={supPhone}
                onChange={(e) => setSupPhone(e.target.value)}
                placeholder="0912 345 678"
                className="h-10 text-xs font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">
                Email / Địa chỉ / Điều khoản thanh toán
              </label>
              <Input
                value={supNote}
                onChange={(e) => setSupNote(e.target.value)}
                placeholder="Ví dụ: sales@supplier.vn • Công nợ 15 ngày..."
                className="h-10 text-xs"
              />
            </div>

            <Button
              type="submit"
              disabled={busy || !supName.trim()}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-10 text-xs"
            >
              <Plus className="size-4 mr-1.5" />
              {busy ? 'Đang lưu đối tác...' : 'Lưu Nhà Cung Cấp'}
            </Button>
          </form>
        </div>

        {/* Right: Supplier Directory */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-extrabold text-slate-900">
                Danh Bạ Đối Tác Cung Ứng ({suppliers.length})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Quản lý thông tin đầu mối liên hệ và lịch sử giao dịch
              </p>
            </div>

            <div className="relative w-full sm:w-56">
              <Search className="size-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm NCC, số điện thoại..."
                className="pl-8 h-8 text-xs"
              />
            </div>
          </div>

          {filteredSuppliers.length === 0 ? (
            <p className="text-xs text-slate-400 py-10 text-center">
              Chưa có nhà cung cấp nào trong danh bạ.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {filteredSuppliers.map((s) => (
                <div
                  key={s.id}
                  className="p-4 rounded-xl border border-slate-100 bg-slate-50/70 hover:bg-slate-50 flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-extrabold text-slate-900 text-sm">{s.name}</span>
                    </div>

                    {s.phone && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-600 font-mono">
                        <Phone className="size-3 text-slate-400" />
                        <span>{s.phone}</span>
                      </div>
                    )}

                    {s.note && (
                      <p className="text-xs text-slate-500 leading-relaxed bg-white/70 p-2 rounded-lg border border-slate-100">
                        {s.note}
                      </p>
                    )}
                  </div>

                  <Link
                    href={`/admin/inventory/receive?supplierId=${s.id}`}
                    className="pt-2 border-t border-slate-200/60 text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center justify-between"
                  >
                    <span>Lập phiếu nhập hàng</span>
                    <ArrowDownToLine className="size-3.5" />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
