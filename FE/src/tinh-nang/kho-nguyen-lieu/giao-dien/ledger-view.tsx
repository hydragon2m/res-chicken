'use client';

import { useState, useMemo } from 'react';
import { BookOpen, Search } from 'lucide-react';
import { Input } from '@/thanh-phan/giao-dien/input';
import { formatDateTime, formatDate, formatQuantity } from '@/thu-vien/format';
import type { LedgerRow, Ingredient, Location } from '@/tinh-nang/kho-nguyen-lieu/types';
import { unitLabel, ledgerLabel, ledgerBadgeColor } from '@/tinh-nang/kho-nguyen-lieu/types';

interface LedgerViewProps {
  ledger: LedgerRow[];
  ingredients: Ingredient[];
  locations: Location[];
}

export function LedgerView({ ledger, ingredients, locations }: LedgerViewProps) {
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [ingredientFilter, setIngredientFilter] = useState('ALL');
  const [locationFilter, setLocationFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  const filteredLedger = useMemo(() => {
    return ledger.filter((row) => {
      if (typeFilter !== 'ALL') {
        if (typeFilter === 'TRANSFER') {
          if (row.type !== 'TRANSFER_IN' && row.type !== 'TRANSFER_OUT') return false;
        } else if (row.type !== typeFilter) {
          return false;
        }
      }
      if (ingredientFilter !== 'ALL' && row.ingredient.id !== ingredientFilter) return false;
      if (locationFilter !== 'ALL' && row.location.id !== locationFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matchIng = row.ingredient.name.toLowerCase().includes(q);
        const matchNote = row.note?.toLowerCase().includes(q) ?? false;
        const matchSku = row.ingredient.sku.toLowerCase().includes(q);
        const matchLot = row.lot?.code?.toLowerCase().includes(q) ?? false;
        if (!matchIng && !matchNote && !matchSku && !matchLot) return false;
      }
      return true;
    });
  }, [ledger, typeFilter, ingredientFilter, locationFilter, search]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
      <div className="p-5 border-b border-slate-100 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <BookOpen className="size-5 text-amber-600" />
              <span>Sổ Cái Biến Động Kho & Nhật Ký Thẻ Kho (Inventory Ledger)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Truy vết toàn bộ lịch sử Nhập hàng, Trừ kho tự động theo đơn bán (BOM), Chuyển vị trí, Kiểm kê và Xuất hủy
            </p>
          </div>
          <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-full self-start sm:self-auto">
            Hiển thị {filteredLedger.length}/{ledger.length} bút toán
          </span>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
            {[
              { key: 'ALL', label: 'Tất cả' },
              { key: 'RECEIPT', label: 'Nhập hàng' },
              { key: 'CONSUMPTION', label: 'Trừ kho BOM' },
              { key: 'TRANSFER', label: 'Chuyển kho' },
              { key: 'COUNT_ADJUSTMENT', label: 'Kiểm kê' },
              { key: 'WASTE', label: 'Báo hủy' },
            ].map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTypeFilter(t.key)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  typeFilter === t.key
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <select
            aria-label="Lọc theo nguyên liệu"
            value={ingredientFilter}
            onChange={(e) => setIngredientFilter(e.target.value)}
            className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">Tất cả nguyên liệu ({ingredients.length})</option>
            {ingredients.map((ing) => (
              <option key={ing.id} value={ing.id}>
                {ing.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Lọc theo vị trí"
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">Tất cả kho ({locations.length})</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>

          <div className="relative flex-1 min-w-44">
            <Search className="size-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên, SKU, ghi chú..."
              className="pl-8 h-9 text-xs"
            />
          </div>
        </div>
      </div>

      {filteredLedger.length === 0 ? (
        <div className="py-14 text-center text-xs text-slate-400">
          Không có bút toán thẻ kho nào phù hợp với bộ lọc đã chọn.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-5 py-3">Thời điểm</th>
                <th className="px-4 py-3">Nghiệp vụ</th>
                <th className="px-4 py-3">Nguyên vật liệu</th>
                <th className="px-4 py-3">Kho / Vị trí</th>
                <th className="px-4 py-3">Lô & Hạn sử dụng</th>
                <th className="px-4 py-3 text-right">Biến động</th>
                <th className="px-5 py-3">Ghi chú & Chứng từ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLedger.map((row) => {
                const isPositive =
                  row.type === 'RECEIPT' ||
                  row.type === 'TRANSFER_IN' ||
                  (row.type === 'COUNT_ADJUSTMENT' && row.quantity > 0);
                return (
                  <tr key={row.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-5 py-3 text-slate-500 font-mono text-[11px]">
                      {formatDateTime(row.occurredAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${
                          ledgerBadgeColor[row.type] ?? 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {ledgerLabel[row.type] ?? row.type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-bold text-slate-900 block">{row.ingredient.name}</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {row.ingredient.sku}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-slate-700">{row.location.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      {row.lot ? (
                        <div>
                          <span className="font-mono text-slate-800">{row.lot.code}</span>
                          {row.lot.expiresAt && (
                            <span className="text-[10px] text-slate-400 block">
                              HSD: {formatDate(row.lot.expiresAt)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`font-mono font-extrabold ${
                          isPositive ? 'text-emerald-700' : 'text-slate-900'
                        }`}
                      >
                        {isPositive ? '+' : ''}
                        {formatQuantity(row.quantity, unitLabel[row.ingredient.unit])}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-500 max-w-xs truncate">
                      {row.note ?? '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
