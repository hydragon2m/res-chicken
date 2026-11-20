'use client';

import { useState, useMemo, type FormEvent } from 'react';
import { CookingPot, Plus, Trash2, Search, CheckCircle2 } from 'lucide-react';
import { Button } from '@/thanh-phan/giao-dien/button';
import { Input } from '@/thanh-phan/giao-dien/input';
import { apiRequest } from '@/thu-vien/auth';
import { formatQuantity } from '@/thu-vien/format';
import type { Product, Ingredient, Recipe } from '@/tinh-nang/kho-nguyen-lieu/types';
import { unitLabel } from '@/tinh-nang/kho-nguyen-lieu/types';

interface RecipesViewProps {
  storeId: string;
  products: Product[];
  ingredients: Ingredient[];
  recipes: Recipe[];
  busy: boolean;
  run: (operation: () => Promise<void>, successMessage?: string) => Promise<void>;
}

export function RecipesView({
  storeId,
  products,
  ingredients,
  recipes,
  busy,
  run,
}: RecipesViewProps) {
  const [productId, setProductId] = useState('');
  const [lines, setLines] = useState([{ ingredientId: '', quantity: '' }]);
  const [recipeSearch, setRecipeSearch] = useState('');

  const activeRecipes = useMemo(() => {
    return recipes
      .filter((r) => r.isActive)
      .filter((r) =>
        recipeSearch.trim()
          ? r.product.name.toLowerCase().includes(recipeSearch.trim().toLowerCase())
          : true,
      );
  }, [recipes, recipeSearch]);

  const handleSelectProduct = (nextProductId: string) => {
    setProductId(nextProductId);
    const existing = recipes.find((r) => r.isActive && r.product.id === nextProductId);
    if (existing && existing.lines.length > 0) {
      setLines(
        existing.lines.map((l) => ({
          ingredientId: l.ingredient.id,
          quantity: String(l.quantity),
        })),
      );
    } else {
      setLines([{ ingredientId: ingredients[0]?.id ?? '', quantity: '1' }]);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(async () => {
      await apiRequest('/inventory/recipes', {
        method: 'POST',
        body: JSON.stringify({
          storeId,
          productId,
          lines: lines.map((line) => ({
            ingredientId: line.ingredientId,
            quantity: Number(line.quantity),
          })),
        }),
      });
      setProductId('');
      setLines([{ ingredientId: '', quantity: '' }]);
    }, 'Đã lưu định mức công thức món (BOM) thành công!');
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Form: Configure BOM */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-6 space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <CookingPot className="size-5 text-amber-600" />
              <span>Thiết Lập Định Mức Món Ăn (Bill of Materials - BOM)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Khi khách gọi món hoặc bếp KDS hoàn thành, hệ thống sẽ tự động trừ kho nguyên liệu theo đúng tỷ lệ định mức
            </p>
          </div>

          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">
                Món ăn cần cài đặt công thức <span className="text-rose-500">*</span>
              </label>
              <select
                aria-label="Chọn món ăn"
                required
                value={productId}
                onChange={(e) => handleSelectProduct(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:border-amber-500"
              >
                <option value="">-- Chọn món trong thực đơn --</option>
                {products.map((p) => {
                  const hasBOM = recipes.some((r) => r.isActive && r.product.id === p.id);
                  return (
                    <option key={p.id} value={p.id}>
                      {p.name} {hasBOM ? '✓ (Đã có định mức)' : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                  Định lượng nguyên vật liệu cho 1 suất
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setLines((prev) => [
                      ...prev,
                      { ingredientId: ingredients[0]?.id ?? '', quantity: '10' },
                    ])
                  }
                  className="text-xs h-8"
                >
                  <Plus className="size-3.5 mr-1" />
                  Thêm nguyên liệu
                </Button>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                {lines.map((line, idx) => {
                  const ing = ingredients.find((i) => i.id === line.ingredientId);
                  return (
                    <div key={idx} className="p-3 bg-white flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <select
                          aria-label="Nguyên liệu"
                          value={line.ingredientId}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((l, i) =>
                                i === idx ? { ...l, ingredientId: e.target.value } : l,
                              ),
                            )
                          }
                          className="w-full h-8 px-2 rounded-lg border border-slate-200 text-xs font-semibold"
                        >
                          <option value="">-- Chọn nguyên liệu --</option>
                          {ingredients.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name} ({unitLabel[item.unit]})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="w-32 shrink-0 flex items-center gap-1">
                        <Input
                          type="number"
                          min="0.001"
                          step="any"
                          required
                          value={line.quantity}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((l, i) =>
                                i === idx ? { ...l, quantity: e.target.value } : l,
                              ),
                            )
                          }
                          placeholder="Số lượng"
                          className="h-8 text-xs font-bold text-right"
                        />
                        <span className="text-slate-400 font-bold text-[11px] w-6">
                          {ing ? unitLabel[ing.unit] : ''}
                        </span>
                      </div>

                      {lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                          className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <Button
              type="submit"
              disabled={busy || !productId}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold h-10"
            >
              <CookingPot className="size-4 mr-2" />
              {busy ? 'Đang lưu công thức...' : 'Lưu Định Mức Món Ăn'}
            </Button>
          </form>
        </div>

        {/* Right List: Active BOM Recipes */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
              Món Ăn Đã Cấu Hình ({activeRecipes.length})
            </h3>
            <span className="text-[11px] text-slate-400">Bấm để chỉnh sửa</span>
          </div>

          <div className="relative">
            <Search className="size-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              value={recipeSearch}
              onChange={(e) => setRecipeSearch(e.target.value)}
              placeholder="Tìm món có định mức..."
              className="pl-8 h-8 text-xs"
            />
          </div>

          {activeRecipes.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">
              Chưa có món ăn nào được thiết lập công thức BOM.
            </p>
          ) : (
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              {activeRecipes.map((r) => (
                <div
                  key={r.id}
                  onClick={() => handleSelectProduct(r.product.id)}
                  className={`p-3.5 rounded-xl border text-xs cursor-pointer transition-all ${
                    productId === r.product.id
                      ? 'border-amber-500 bg-amber-50/50 ring-2 ring-amber-500/20'
                      : 'border-slate-100 bg-slate-50/60 hover:bg-slate-100/70'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-extrabold text-slate-900 text-sm">{r.product.name}</span>
                    <span className="text-[10px] font-mono text-slate-400">
                      Phiên bản v{r.version}
                    </span>
                  </div>

                  <ul className="space-y-1 text-slate-600 text-[11px] divide-y divide-slate-100/80">
                    {r.lines.map((line) => (
                      <li key={line.id} className="pt-1 flex items-center justify-between">
                        <span>{line.ingredient.name}</span>
                        <strong className="text-slate-900 font-mono">
                          {formatQuantity(line.quantity, unitLabel[line.ingredient.unit])}
                        </strong>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
