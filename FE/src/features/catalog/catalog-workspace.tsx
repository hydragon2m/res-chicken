'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FolderKanban,
  UtensilsCrossed,
  Sliders,
  CalendarClock,
  Plus,
  Pencil,
  Trash2,
  Search,
  Eye,
  EyeOff,
  Flame,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { AccessDenied } from '@/components/access-denied';
import { apiRequest, getActor, type Actor } from '@/lib/auth';
import { useActiveStore } from '@/lib/store-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

type Section = 'categories' | 'products' | 'option-groups' | 'price-schedules';
type Category = {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
};
type Price = {
  id: string;
  amount: number;
  startsAt: string;
  endsAt: string | null;
};
type Variant = {
  id: string;
  name: string;
  isSoldOut: boolean;
  prices: Price[];
};
type Product = {
  id: string;
  name: string;
  imageUrl?: string | null;
  isActive: boolean;
  isSoldOut: boolean;
  inventoryMode: 'TRACKED' | 'NOT_TRACKED';
  category: Category;
  variants: Variant[];
  optionGroups: Array<{
    optionGroupId: string;
    optionGroup: { id: string; name: string };
  }>;
};
type Option = {
  id: string;
  name: string;
  priceDelta: number;
  isSoldOut: boolean;
};
type OptionGroup = {
  id: string;
  name: string;
  minSelections: number;
  maxSelections: number;
  options: Option[];
  products: { productId: string }[];
};
type PriceRow = Price & {
  variant: { id: string; name: string; product: { id: string; name: string } };
};
type Action = (path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: object) => Promise<void>;

const sections = [
  { id: 'products', label: '1. Danh sách Món ăn & Biến thể', icon: UtensilsCrossed },
  { id: 'categories', label: '2. Danh mục Món', icon: FolderKanban },
  { id: 'option-groups', label: '3. Nhóm Tuỳ chọn (Sốt/Topping)', icon: Sliders },
  { id: 'price-schedules', label: '4. Lịch Giá & Khung Giờ', icon: CalendarClock },
];

function money(amount: number) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount);
}

function localDateTime(iso?: string) {
  const date = iso ? new Date(iso) : new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function utcIsoFromLocal(localValue: string): string | null {
  if (!localValue) return null;
  const parsed = new Date(localValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function CatalogWorkspace({ initialSection }: { initialSection: Section }) {
  const router = useRouter();
  const { currentStoreId: storeId, currentStore } = useActiveStore();
  const [actor, setActor] = useState<Actor | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [groups, setGroups] = useState<OptionGroup[]>([]);
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [loading, setLoading] = useState(true);

  const canRead =
    (actor?.permissions.includes('catalog.manage') ||
      actor?.permissions.includes('catalog.read')) ??
    false;
  const canManage = actor?.permissions.includes('catalog.manage') ?? false;
  const active = useMemo(
    () => sections.find((item) => item.id === initialSection) ?? sections[0],
    [initialSection],
  );

  const load = useCallback(
    async (nextStoreId = storeId) => {
      if (!nextStoreId) return;
      setLoading(true);
      try {
        const [nextCategories, nextProducts, nextGroups, nextPrices] = await Promise.all([
          apiRequest<Category[]>(`/categories?storeId=${nextStoreId}`),
          apiRequest<Product[]>(`/products?storeId=${nextStoreId}`),
          apiRequest<OptionGroup[]>(`/option-groups?storeId=${nextStoreId}`),
          apiRequest<PriceRow[]>(`/price-schedules?storeId=${nextStoreId}`),
        ]);
        setCategories(nextCategories || []);
        setProducts(nextProducts || []);
        setGroups(nextGroups || []);
        setPrices(nextPrices || []);
      } catch {
        toast.error('Không thể tải dữ liệu thực đơn.');
      } finally {
        setLoading(false);
      }
    },
    [storeId],
  );

  useEffect(() => {
    getActor()
      .then((nextActor) => {
        setActor(nextActor);
        if (
          !nextActor.permissions.includes('catalog.manage') &&
          !nextActor.permissions.includes('catalog.read')
        ) {
          setLoading(false);
        }
      })
      .catch(() => {
        router.replace('/login');
      });
  }, [router]);

  useEffect(() => {
    if (!storeId || !canRead) return;
    void load(storeId);
  }, [storeId, canRead, load]);

  const action: Action = async (path, method, body) => {
    try {
      await apiRequest(path, {
        method,
        body: body ? JSON.stringify(body) : undefined,
      });
      toast.success('Đã lưu thay đổi.');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể lưu thay đổi.');
    }
  };

  if (!actor && loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-slate-500 text-sm">
        <RefreshCw className="size-5 animate-spin mr-2 text-amber-600" />
        Đang mở quản lý thực đơn…
      </div>
    );
  }

  if (!actor || !canRead) {
    return <AccessDenied area="Quản lý Thực đơn" permission="catalog.manage" />;
  }

  return (
    <div className="w-full p-4 sm:p-6 lg:px-8 space-y-6 font-sans">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="size-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-sm">
            <UtensilsCrossed className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
                Quản Lý Thực Đơn, Món Ăn & Bảng Giá
              </h1>
              {actor.isPlatformAdmin || actor.role === 'ADMIN' ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 text-[11px] font-bold text-indigo-800">
                  🌐 Chế độ Admin: Tự động thêm/sửa cho Toàn bộ Chi nhánh
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                  🏪 Chế độ Quản lý: Chỉ áp dụng riêng tại {currentStore?.name ?? 'Cửa hàng này'}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Chi nhánh đang xem:{' '}
              <span className="font-semibold text-slate-700">
                {currentStore?.name ?? 'Chick Res Main'}
              </span>{' '}
              • {products.length} món ăn • {categories.length} danh mục • {groups.length} nhóm sốt
              {(actor.isPlatformAdmin || actor.role === 'ADMIN') &&
                ' • (Bật/tắt "Hết hàng" chỉ tác động riêng chi nhánh đang chọn)'}
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => void load(storeId)}
          className="text-xs gap-1.5 cursor-pointer"
        >
          <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Làm mới dữ liệu</span>
        </Button>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto border-b border-slate-200 pb-0">
        {sections.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === active.id;
          return (
            <Link
              key={item.id}
              href={`/admin/catalog/${item.id}`}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 whitespace-nowrap transition-all ${
                isActive
                  ? 'border-amber-500 text-amber-900 bg-amber-50/50'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              <Icon className="size-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>

      {/* Tab Contents */}
      {loading ? (
        <div className="flex items-center justify-center p-12 text-slate-500 text-xs">
          <RefreshCw className="size-5 animate-spin mr-2 text-amber-600" />
          Đang đồng bộ dữ liệu thực đơn…
        </div>
      ) : (
        <div className="space-y-6">
          {initialSection === 'categories' && (
            <CategoriesView
              canManage={canManage}
              storeId={storeId!}
              items={categories}
              action={action}
            />
          )}
          {initialSection === 'products' && (
            <ProductsView
              canManage={canManage}
              storeId={storeId!}
              items={products}
              categories={categories}
              groups={groups}
              action={action}
            />
          )}
          {initialSection === 'option-groups' && (
            <OptionGroupsView
              canManage={canManage}
              storeId={storeId!}
              items={groups}
              action={action}
            />
          )}
          {initialSection === 'price-schedules' && (
            <PricesView canManage={canManage} products={products} items={prices} action={action} />
          )}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// 1. Categories Structured Table View
// ----------------------------------------------------------------------
function CategoriesView({
  canManage,
  storeId,
  items,
  action,
}: {
  canManage: boolean;
  storeId: string;
  items: Category[];
  action: Action;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editItem, setEditItem] = useState<Category | null>(null);
  const [deleteItem, setDeleteItem] = useState<Category | null>(null);

  const [name, setName] = useState('');
  const [sortOrder, setSortOrder] = useState('0');

  const handleCreate = async () => {
    if (!name.trim()) return toast.warning('Nhập tên danh mục.');
    await action('/categories', 'POST', {
      storeId,
      name: name.trim(),
      sortOrder: Number(sortOrder) || 0,
    });
    setName('');
    setSortOrder('0');
    setCreateOpen(false);
  };

  const handleEdit = async () => {
    if (!editItem || !name.trim()) return;
    await action(`/categories/${editItem.id}`, 'PATCH', {
      name: name.trim(),
      sortOrder: Number(sortOrder) || 0,
    });
    setEditItem(null);
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    await action(`/categories/${deleteItem.id}`, 'DELETE');
    setDeleteItem(null);
  };

  return (
    <Card className="rounded-2xl border-slate-200/90 shadow-2xs overflow-hidden">
      <CardHeader className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm font-bold text-slate-900">
            Danh sách Danh mục Thực đơn ({items.length})
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Thứ tự ưu tiên nhỏ hơn sẽ được xếp lên trước trên màn hình POS và Menu QR
          </CardDescription>
        </div>
        {canManage && (
          <Button
            size="sm"
            onClick={() => {
              setName('');
              setSortOrder(String((items.length + 1) * 10));
              setCreateOpen(true);
            }}
            className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold gap-1.5 cursor-pointer"
          >
            <Plus className="size-4" />
            <span>Thêm danh mục</span>
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-500 font-bold uppercase text-[11px]">
              <tr>
                <th className="py-3.5 px-6 w-28">Thứ tự</th>
                <th className="py-3.5 px-4">Tên danh mục món</th>
                <th className="py-3.5 px-4 text-center">Trạng thái hiển thị</th>
                <th className="py-3.5 px-6 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-slate-400">
                    Chưa có danh mục món ăn nào.
                  </td>
                </tr>
              ) : (
                items.map((cat) => (
                  <tr key={cat.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-6 font-mono font-bold text-slate-600">
                      #{cat.sortOrder}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900 text-sm">{cat.name}</td>
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                          cat.isActive
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-slate-100 text-slate-500 border-slate-200'
                        }`}
                      >
                        {cat.isActive ? 'Đang hiển thị' : 'Đã ẩn'}
                      </span>
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      {canManage && (
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() =>
                              void action(`/categories/${cat.id}`, 'PATCH', {
                                isActive: !cat.isActive,
                              })
                            }
                            className="gap-1 cursor-pointer"
                          >
                            {cat.isActive ? (
                              <>
                                <EyeOff className="size-3.5" />
                                <span>Ẩn</span>
                              </>
                            ) : (
                              <>
                                <Eye className="size-3.5" />
                                <span>Hiện</span>
                              </>
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => {
                              setEditItem(cat);
                              setName(cat.name);
                              setSortOrder(String(cat.sortOrder));
                            }}
                            className="gap-1 cursor-pointer"
                          >
                            <Pencil className="size-3.5" />
                            <span>Sửa</span>
                          </Button>
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => setDeleteItem(cat)}
                            className="text-rose-600 border-rose-200 hover:bg-rose-50 cursor-pointer"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Thêm danh mục mới</DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Nhập tên nhóm thực đơn (VD: Gà rán giòn, Burger & Cơm, Đồ uống...).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-semibold text-slate-700">Tên danh mục</label>
              <Input
                placeholder="VD: Gà rán sốt đặc biệt"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">
                Thứ tự hiển thị (Số nhỏ đứng trước)
              </label>
              <Input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>
              Huỷ
            </Button>
            <Button
              size="sm"
              onClick={() => void handleCreate()}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              Tạo danh mục
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      {editItem && (
        <Dialog open={!!editItem} onOpenChange={(open) => !open && setEditItem(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-base font-bold">Chỉnh sửa danh mục</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <label className="text-xs font-semibold text-slate-700">Tên danh mục</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">Thứ tự hiển thị</label>
                <Input
                  type="number"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditItem(null)}>
                Huỷ
              </Button>
              <Button
                size="sm"
                onClick={() => void handleEdit()}
                className="bg-amber-500 hover:bg-amber-600 text-white"
              >
                Lưu thay đổi
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Dialog */}
      {deleteItem && (
        <Dialog open={!!deleteItem} onOpenChange={(open) => !open && setDeleteItem(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-rose-600">
                Xác nhận xoá danh mục
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Bạn có chắc chắn muốn xoá danh mục &ldquo;{deleteItem.name}&rdquo;?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteItem(null)}>
                Bỏ qua
              </Button>
              <Button
                size="sm"
                onClick={() => void handleDelete()}
                className="bg-rose-600 hover:bg-rose-700 text-white"
              >
                Xác nhận xoá
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

// ----------------------------------------------------------------------
// 2. Products Structured Data Table View
// ----------------------------------------------------------------------
function ProductsView({
  canManage,
  storeId,
  items,
  categories,
  groups,
  action,
}: {
  canManage: boolean;
  storeId: string;
  items: Product[];
  categories: Category[];
  groups: OptionGroup[];
  action: Action;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [filterCat, setFilterCat] = useState('all');
  const [search, setSearch] = useState('');

  // Create form states
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [inventoryMode, setInventoryMode] = useState<'TRACKED' | 'NOT_TRACKED'>('TRACKED');
  const [variantsText, setVariantsText] = useState('Tiêu chuẩn');
  const [initialPrice, setInitialPrice] = useState('45000');

  // Edit product dialog
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editInventoryMode, setEditInventoryMode] = useState<'TRACKED' | 'NOT_TRACKED'>('TRACKED');

  // Add variant dialog
  const [addVariantProduct, setAddVariantProduct] = useState<Product | null>(null);
  const [newVariantName, setNewVariantName] = useState('');
  const [newVariantPrice, setNewVariantPrice] = useState('45000');

  // Quick set price dialog
  const [pricingVariant, setPricingVariant] = useState<{
    productName: string;
    variant: Variant;
  } | null>(null);
  const [quickPriceAmount, setQuickPriceAmount] = useState('45000');

  const handleCreateProduct = async () => {
    if (!name.trim()) return toast.warning('Nhập tên món ăn.');
    if (!categoryId) return toast.warning('Vui lòng chọn danh mục.');
    const variants = variantsText
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean)
      .map((n) => ({ name: n }));
    if (!variants.length) return toast.warning('Cần ít nhất 1 biến thể.');

    try {
      const created = await apiRequest<Product>('/products', {
        method: 'POST',
        body: JSON.stringify({
          storeId,
          categoryId,
          name: name.trim(),
          inventoryMode,
          variants,
        }),
      });
      const priceVal = Number(initialPrice);
      if (created?.variants?.length && priceVal > 0) {
        await Promise.all(
          created.variants.map((v) =>
            apiRequest('/price-schedules', {
              method: 'POST',
              body: JSON.stringify({
                variantId: v.id,
                amount: priceVal,
                startsAt: new Date(Date.now() - 60_000).toISOString(),
              }),
            }),
          ),
        );
      }
      toast.success('Đã thêm món ăn và khởi tạo giá bán thành công');
      setName('');
      setVariantsText('Tiêu chuẩn');
      setCreateOpen(false);
      await action(`/products/${created.id}`, 'PATCH', { isActive: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể tạo món ăn');
    }
  };

  const handleSaveEditProduct = async () => {
    if (!editingProduct || !editName.trim()) return;
    await action(`/products/${editingProduct.id}`, 'PATCH', {
      name: editName.trim(),
      categoryId: editCategoryId,
      inventoryMode: editInventoryMode,
    });
    setEditingProduct(null);
  };

  const handleAddVariant = async () => {
    if (!addVariantProduct || !newVariantName.trim()) return;
    try {
      const createdVar = await apiRequest<Variant>(`/products/${addVariantProduct.id}/variants`, {
        method: 'POST',
        body: JSON.stringify({ name: newVariantName.trim() }),
      });
      if (createdVar?.id && Number(newVariantPrice) > 0) {
        await apiRequest('/price-schedules', {
          method: 'POST',
          body: JSON.stringify({
            variantId: createdVar.id,
            amount: Number(newVariantPrice),
            startsAt: new Date(Date.now() - 60_000).toISOString(),
          }),
        });
      }
      setNewVariantName('');
      setAddVariantProduct(null);
      await action(`/products/${addVariantProduct.id}`, 'PATCH', {
        isActive: addVariantProduct.isActive,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể thêm biến thể');
    }
  };

  const handleQuickSetPrice = async () => {
    if (!pricingVariant || Number(quickPriceAmount) <= 0) return;
    await action('/price-schedules', 'POST', {
      variantId: pricingVariant.variant.id,
      amount: Number(quickPriceAmount),
      startsAt: new Date().toISOString(),
    });
    setPricingVariant(null);
  };

  const filteredProducts = useMemo(() => {
    return items.filter((p) => {
      const matchCat = filterCat === 'all' || p.category.id === filterCat;
      const matchSearch =
        !search.trim() || p.name.toLowerCase().includes(search.toLowerCase().trim());
      return matchCat && matchSearch;
    });
  }, [items, filterCat, search]);

  return (
    <div className="space-y-4">
      {/* Action Header & Filters */}
      <Card className="rounded-2xl border-slate-200/90 shadow-2xs">
        <CardContent className="p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex flex-1 flex-wrap items-center gap-2.5">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <Input
                placeholder="Tìm kiếm món ăn theo tên..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>

            <select
              aria-label="Lọc theo danh mục"
              value={filterCat}
              onChange={(e) => setFilterCat(e.target.value)}
              className="h-9 px-3 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 focus:outline-none"
            >
              <option value="all">Tất cả danh mục ({items.length} món)</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {canManage && (
            <Button
              size="sm"
              onClick={() => {
                setCategoryId(categories[0]?.id || '');
                setCreateOpen(true);
              }}
              className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold gap-1.5 shadow-xs cursor-pointer"
            >
              <Plus className="size-4" />
              <span>Thêm món ăn mới</span>
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Structured Products Data Table */}
      <Card className="rounded-2xl border-slate-200/90 shadow-2xs overflow-hidden">
        <CardHeader className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <CardTitle className="text-sm font-bold text-slate-900">
            Bảng danh sách Món ăn, Biến thể & Giá niêm yết ({filteredProducts.length})
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Click vào giá biến thể để cập nhật giá bán mới hoặc gắn thêm nhóm sốt tuỳ chọn
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-500 font-bold uppercase text-[11px]">
                <tr>
                  <th className="py-3.5 px-6">Món ăn & Định mức kho</th>
                  <th className="py-3.5 px-4">Danh mục</th>
                  <th className="py-3.5 px-4">Biến thể & Giá hiện hành</th>
                  <th className="py-3.5 px-4">Nhóm tuỳ chọn (Modifiers)</th>
                  <th className="py-3.5 px-4 text-center">Trạng thái</th>
                  <th className="py-3.5 px-6 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400">
                      Không tìm thấy món ăn nào phù hợp.
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((product) => (
                    <tr key={product.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-6">
                        <div className="flex items-center gap-3">
                          <div className="size-10 rounded-xl bg-amber-50 border border-amber-200/70 flex items-center justify-center shrink-0 text-amber-600">
                            <Flame className="size-5" />
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 text-sm">{product.name}</div>
                            <span
                              className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded mt-0.5 ${
                                product.inventoryMode === 'TRACKED'
                                  ? 'bg-blue-50 text-blue-700'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {product.inventoryMode === 'TRACKED'
                                ? 'Trừ kho BOM tự động'
                                : 'Không trừ kho'}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="inline-flex px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 font-semibold">
                          {product.category.name}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="space-y-1.5">
                          {product.variants.map((v) => {
                            const currentPrice = v.prices?.[0]?.amount ?? 0;
                            return (
                              <div
                                key={v.id}
                                className="flex items-center justify-between gap-2 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200/80 max-w-[260px]"
                              >
                                <div className="min-w-0">
                                  <span className="font-bold text-slate-800">{v.name}</span>
                                  {v.isSoldOut && (
                                    <span className="ml-1 text-[10px] font-bold text-rose-600">
                                      (Hết)
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (!canManage) return;
                                      setPricingVariant({
                                        productName: product.name,
                                        variant: v,
                                      });
                                      setQuickPriceAmount(String(currentPrice || 45000));
                                    }}
                                    title="Click để cập nhật giá bán"
                                    className="font-mono font-extrabold text-amber-700 hover:underline cursor-pointer"
                                  >
                                    {currentPrice > 0 ? money(currentPrice) : 'Chưa có giá'}
                                  </button>
                                  {canManage && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void action(`/variants/${v.id}/sold-out`, 'PATCH', {
                                          isSoldOut: !v.isSoldOut,
                                        })
                                      }
                                      className="text-[10px] text-slate-400 hover:text-amber-700 underline cursor-pointer"
                                    >
                                      {v.isSoldOut ? 'Mở' : 'Hết'}
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                          {canManage && (
                            <button
                              type="button"
                              onClick={() => setAddVariantProduct(product)}
                              className="text-[11px] font-semibold text-amber-700 hover:underline cursor-pointer"
                            >
                              + Thêm biến thể / size
                            </button>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap items-center gap-1.5 max-w-[220px]">
                          {product.optionGroups.map((link) => (
                            <span
                              key={link.optionGroupId}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 text-purple-800 border border-purple-200 text-[11px] font-semibold"
                            >
                              <span>{link.optionGroup.name}</span>
                              {canManage && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void action(
                                      `/products/${product.id}/option-groups/${link.optionGroupId}`,
                                      'DELETE',
                                    )
                                  }
                                  className="hover:text-rose-600 cursor-pointer"
                                >
                                  ✕
                                </button>
                              )}
                            </span>
                          ))}
                          {canManage && (
                            <select
                              aria-label="Gắn nhóm tuỳ chọn"
                              defaultValue=""
                              onChange={(e) => {
                                if (e.target.value) {
                                  void action(`/products/${product.id}/option-groups`, 'POST', {
                                    optionGroupId: e.target.value,
                                  });
                                  e.target.value = '';
                                }
                              }}
                              className="text-[11px] px-2 py-0.5 rounded border border-slate-200 bg-white text-slate-600 cursor-pointer"
                            >
                              <option value="">+ Gắn nhóm sốt</option>
                              {groups
                                .filter(
                                  (g) =>
                                    !product.optionGroups.some((l) => l.optionGroupId === g.id),
                                )
                                .map((g) => (
                                  <option key={g.id} value={g.id}>
                                    {g.name}
                                  </option>
                                ))}
                            </select>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                            product.isSoldOut
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : product.isActive
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-slate-100 text-slate-500 border-slate-200'
                          }`}
                        >
                          {product.isSoldOut
                            ? 'Tạm hết hàng'
                            : product.isActive
                              ? 'Đang bán'
                              : 'Đã ẩn'}
                        </span>
                      </td>

                      <td className="py-3.5 px-6 text-right">
                        {canManage && (
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <Button
                              variant="outline"
                              size="xs"
                              onClick={() => {
                                setEditingProduct(product);
                                setEditName(product.name);
                                setEditCategoryId(product.category.id);
                                setEditInventoryMode(product.inventoryMode);
                              }}
                              className="gap-1 cursor-pointer"
                            >
                              <Pencil className="size-3.5" />
                              <span>Sửa</span>
                            </Button>
                            <Button
                              variant="outline"
                              size="xs"
                              onClick={() =>
                                void action(`/products/${product.id}/sold-out`, 'PATCH', {
                                  isSoldOut: !product.isSoldOut,
                                })
                              }
                              className="text-amber-700 border-amber-200 hover:bg-amber-50 cursor-pointer"
                            >
                              {product.isSoldOut ? 'Mở bán' : 'Báo hết'}
                            </Button>
                            <Button
                              variant="outline"
                              size="xs"
                              onClick={() => {
                                if (confirm(`Xoá món "${product.name}"?`)) {
                                  void action(`/products/${product.id}`, 'DELETE');
                                }
                              }}
                              className="text-rose-600 border-rose-200 hover:bg-rose-50 cursor-pointer"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create Product Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Thêm món ăn mới vào thực đơn</DialogTitle>
          </DialogHeader>
          <div className="space-y-3.5 py-2">
            <div>
              <label className="text-xs font-semibold text-slate-700">Tên món ăn *</label>
              <Input
                placeholder="VD: Gà Rán Sốt Cay Hàn Quốc"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">Danh mục *</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">Chế độ tồn kho BOM</label>
                <select
                  value={inventoryMode}
                  onChange={(e) => setInventoryMode(e.target.value as 'TRACKED' | 'NOT_TRACKED')}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium"
                >
                  <option value="TRACKED">Trừ kho theo BOM</option>
                  <option value="NOT_TRACKED">Không trừ kho</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">
                  Các biến thể (Cách dấu phẩy)
                </label>
                <Input
                  placeholder="Tiêu chuẩn, Phần lớn"
                  value={variantsText}
                  onChange={(e) => setVariantsText(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">
                  Giá niêm yết ban đầu (VND)
                </label>
                <Input
                  type="number"
                  value={initialPrice}
                  onChange={(e) => setInitialPrice(e.target.value)}
                  className="mt-1 font-mono font-bold"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>
              Huỷ
            </Button>
            <Button
              size="sm"
              onClick={() => void handleCreateProduct()}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              Lưu món ăn
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Product Dialog */}
      <Dialog
        open={Boolean(editingProduct)}
        onOpenChange={(open) => !open && setEditingProduct(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Chỉnh sửa món ăn</DialogTitle>
          </DialogHeader>
          <div className="space-y-3.5 py-2">
            <div>
              <label className="text-xs font-semibold text-slate-700">Tên món ăn</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Danh mục</label>
              <select
                value={editCategoryId}
                onChange={(e) => setEditCategoryId(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Chế độ trừ kho BOM</label>
              <select
                value={editInventoryMode}
                onChange={(e) => setEditInventoryMode(e.target.value as 'TRACKED' | 'NOT_TRACKED')}
                className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium"
              >
                <option value="TRACKED">Trừ kho công thức BOM (TRACKED)</option>
                <option value="NOT_TRACKED">Không trừ kho (NOT_TRACKED)</option>
              </select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditingProduct(null)}>
              Huỷ
            </Button>
            <Button
              size="sm"
              onClick={() => void handleSaveEditProduct()}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              Lưu thay đổi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Variant Dialog */}
      <Dialog
        open={Boolean(addVariantProduct)}
        onOpenChange={(open) => !open && setAddVariantProduct(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              Thêm biến thể cho {addVariantProduct?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-semibold text-slate-700">
                Tên biến thể / Quy cách
              </label>
              <Input
                placeholder="VD: Size L, Phần 3 miếng..."
                value={newVariantName}
                onChange={(e) => setNewVariantName(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Giá bán (VND)</label>
              <Input
                type="number"
                value={newVariantPrice}
                onChange={(e) => setNewVariantPrice(e.target.value)}
                className="mt-1 font-mono font-bold"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setAddVariantProduct(null)}>
              Huỷ
            </Button>
            <Button
              size="sm"
              onClick={() => void handleAddVariant()}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              Thêm biến thể
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Price Dialog */}
      <Dialog
        open={Boolean(pricingVariant)}
        onOpenChange={(open) => !open && setPricingVariant(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              Cập nhật giá: {pricingVariant?.productName} ({pricingVariant?.variant.name})
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <label className="text-xs font-semibold text-slate-700">Giá bán mới (VND)</label>
            <Input
              type="number"
              value={quickPriceAmount}
              onChange={(e) => setQuickPriceAmount(e.target.value)}
              className="mt-1 font-mono font-bold"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setPricingVariant(null)}>
              Huỷ
            </Button>
            <Button
              size="sm"
              onClick={() => void handleQuickSetPrice()}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              Áp dụng giá mới
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ----------------------------------------------------------------------
// 3. Option Groups Structured Table View
// ----------------------------------------------------------------------
function OptionGroupsView({
  canManage,
  storeId,
  items,
  action,
}: {
  canManage: boolean;
  storeId: string;
  items: OptionGroup[];
  action: Action;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [min, setMin] = useState('0');
  const [max, setMax] = useState('1');
  const [optionsStr, setOptionsStr] = useState('');

  // Add option to group
  const [activeGroup, setActiveGroup] = useState<OptionGroup | null>(null);
  const [optName, setOptName] = useState('');
  const [optDelta, setOptDelta] = useState('0');

  const handleCreateGroup = async () => {
    if (!name.trim()) return toast.warning('Nhập tên nhóm tuỳ chọn.');
    const options = optionsStr
      .split(',')
      .map((part) => {
        const [n, delta = '0'] = part.trim().split(':');
        return { name: n?.trim(), priceDelta: Number(delta) || 0 };
      })
      .filter((o) => o.name);

    await action('/option-groups', 'POST', {
      storeId,
      name: name.trim(),
      minSelections: Number(min) || 0,
      maxSelections: Number(max) || 1,
      options,
    });

    setName('');
    setOptionsStr('');
    setCreateOpen(false);
  };

  const handleAddOption = async () => {
    if (!activeGroup || !optName.trim()) return;
    await action(`/option-groups/${activeGroup.id}/options`, 'POST', {
      name: optName.trim(),
      priceDelta: Number(optDelta) || 0,
    });
    setOptName('');
    setOptDelta('0');
    setActiveGroup(null);
  };

  return (
    <Card className="rounded-2xl border-slate-200/90 shadow-2xs overflow-hidden">
      <CardHeader className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm font-bold text-slate-900">
            Danh sách Nhóm Tuỳ Chọn Sốt & Topping ({items.length})
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Cấu hình các lựa chọn vị sốt, đổi miếng gà và phụ thu đi kèm món chính
          </CardDescription>
        </div>
        {canManage && (
          <Button
            size="sm"
            onClick={() => setCreateOpen(true)}
            className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold gap-1.5 cursor-pointer"
          >
            <Plus className="size-4" />
            <span>Thêm nhóm tuỳ chọn</span>
          </Button>
        )}
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-500 font-bold uppercase text-[11px]">
              <tr>
                <th className="py-3.5 px-6">Tên nhóm tuỳ chọn</th>
                <th className="py-3.5 px-4 text-center">Quy tắc chọn</th>
                <th className="py-3.5 px-4">Danh sách lựa chọn & Phụ thu</th>
                <th className="py-3.5 px-4 text-center">Món áp dụng</th>
                <th className="py-3.5 px-6 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-400">
                    Chưa có nhóm tuỳ chọn sốt hoặc topping nào.
                  </td>
                </tr>
              ) : (
                items.map((group) => (
                  <tr key={group.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-6 font-bold text-slate-900 text-sm">{group.name}</td>
                    <td className="py-3.5 px-4 text-center font-mono text-slate-700">
                      Tối thiểu {group.minSelections} • Tối đa {group.maxSelections}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex flex-wrap gap-1.5">
                        {group.options.map((opt) => (
                          <div
                            key={opt.id}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs ${
                              opt.isSoldOut
                                ? 'bg-slate-50 border-slate-200 text-slate-400'
                                : 'bg-amber-50/70 border-amber-200 text-slate-900 font-medium'
                            }`}
                          >
                            <span>{opt.name}</span>
                            {opt.priceDelta > 0 && (
                              <span className="font-mono text-amber-700 font-bold">
                                +{money(opt.priceDelta)}
                              </span>
                            )}
                            {canManage && (
                              <button
                                type="button"
                                onClick={() =>
                                  void action(`/options/${opt.id}/sold-out`, 'PATCH', {
                                    isSoldOut: !opt.isSoldOut,
                                  })
                                }
                                className="text-[10px] text-slate-400 hover:text-amber-700 underline cursor-pointer"
                              >
                                {opt.isSoldOut ? 'Bật' : 'Hết'}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono font-bold text-slate-700">
                      {group.products.length} món
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      {canManage && (
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => setActiveGroup(group)}
                            className="cursor-pointer"
                          >
                            + Lựa chọn
                          </Button>
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => {
                              if (confirm(`Xoá nhóm "${group.name}"?`)) {
                                void action(`/option-groups/${group.id}`, 'DELETE');
                              }
                            }}
                            className="text-rose-600 border-rose-200 hover:bg-rose-50 cursor-pointer"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>

      {/* Create Group Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Thêm nhóm tuỳ chọn (Modifier)</DialogTitle>
          </DialogHeader>
          <div className="space-y-3.5 py-2">
            <div>
              <label className="text-xs font-semibold text-slate-700">Tên nhóm</label>
              <Input
                placeholder="VD: Chọn loại miếng gà, Chọn vị sốt..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-slate-700">Số chọn tối thiểu</label>
                <Input
                  type="number"
                  min="0"
                  value={min}
                  onChange={(e) => setMin(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">Số chọn tối đa</label>
                <Input
                  type="number"
                  min="1"
                  value={max}
                  onChange={(e) => setMax(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">
                Các lựa chọn & phụ thu (VD: Đùi:0, Cánh:0, Phô mai cay:5000)
              </label>
              <Input
                placeholder="Tên1:Giá1, Tên2:Giá2..."
                value={optionsStr}
                onChange={(e) => setOptionsStr(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>
              Huỷ
            </Button>
            <Button
              size="sm"
              onClick={() => void handleCreateGroup()}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              Lưu nhóm tuỳ chọn
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Option Dialog */}
      {activeGroup && (
        <Dialog open={!!activeGroup} onOpenChange={(open) => !open && setActiveGroup(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-base font-bold">
                Thêm lựa chọn vào &ldquo;{activeGroup.name}&rdquo;
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <label className="text-xs font-semibold text-slate-700">Tên lựa chọn</label>
                <Input
                  placeholder="VD: Sốt bơ tỏi hoàng kim"
                  value={optName}
                  onChange={(e) => setOptName(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">
                  Phụ thu (VND, nhập 0 nếu miễn phí)
                </label>
                <Input
                  type="number"
                  value={optDelta}
                  onChange={(e) => setOptDelta(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => setActiveGroup(null)}>
                Huỷ
              </Button>
              <Button
                size="sm"
                onClick={() => void handleAddOption()}
                className="bg-amber-500 hover:bg-amber-600 text-white"
              >
                Xác nhận thêm
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

// ----------------------------------------------------------------------
// 4. Prices Structured Table View
// ----------------------------------------------------------------------
function PricesView({
  canManage,
  products,
  items,
  action,
}: {
  canManage: boolean;
  products: Product[];
  items: PriceRow[];
  action: Action;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const variants = products.flatMap((p) => p.variants.map((v) => ({ ...v, product: p })));

  const [variantId, setVariantId] = useState('');
  const [amount, setAmount] = useState('');
  const [startsAt, setStartsAt] = useState(localDateTime());
  const [endsAt, setEndsAt] = useState('');

  const handleCreatePrice = async () => {
    if (!variantId) return toast.warning('Vui lòng chọn biến thể.');
    if (!amount || Number(amount) <= 0) return toast.warning('Nhập giá bán hợp lệ.');
    const startIso = utcIsoFromLocal(startsAt);
    const endIso = endsAt ? utcIsoFromLocal(endsAt) : undefined;
    if (!startIso) return;

    await action('/price-schedules', 'POST', {
      variantId,
      amount: Number(amount),
      startsAt: startIso,
      endsAt: endIso,
    });

    setAmount('');
    setEndsAt('');
    setCreateOpen(false);
  };

  return (
    <Card className="rounded-2xl border-slate-200/90 shadow-2xs overflow-hidden">
      <CardHeader className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm font-bold text-slate-900">
            Bảng Giá Niêm Yết Theo Lịch ({items.length})
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Quản lý lịch sử giá bán và khung giờ giá đặc biệt cho từng biến thể món ăn
          </CardDescription>
        </div>
        {canManage && (
          <Button
            size="sm"
            onClick={() => {
              setVariantId(variants[0]?.id || '');
              setCreateOpen(true);
            }}
            className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold gap-1.5 cursor-pointer"
          >
            <Plus className="size-4" />
            <span>Lập lịch giá mới</span>
          </Button>
        )}
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-500 font-bold uppercase text-[11px]">
              <tr>
                <th className="py-3.5 px-6">Tên món ăn</th>
                <th className="py-3.5 px-4">Biến thể / Quy cách</th>
                <th className="py-3.5 px-4 text-right">Đơn giá niêm yết</th>
                <th className="py-3.5 px-4">Thời gian bắt đầu</th>
                <th className="py-3.5 px-4">Thời gian kết thúc</th>
                <th className="py-3.5 px-6 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400">
                    Chưa có lịch giá nào được thiết lập.
                  </td>
                </tr>
              ) : (
                items.map((price) => (
                  <tr key={price.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-6 font-bold text-slate-900">
                      {price.variant.product.name}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-700">
                      {price.variant.name}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-extrabold text-amber-700 text-sm">
                      {money(price.amount)}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-600">
                      {new Date(price.startsAt).toLocaleString('vi-VN')}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-600">
                      {price.endsAt
                        ? new Date(price.endsAt).toLocaleString('vi-VN')
                        : 'Đang áp dụng (Không giới hạn)'}
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      {canManage && (
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => {
                            if (confirm('Xoá lịch giá này?')) {
                              void action(`/price-schedules/${price.id}`, 'DELETE');
                            }
                          }}
                          className="text-rose-600 border-rose-200 hover:bg-rose-50 cursor-pointer"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>

      {/* Create Price Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Lập giá niêm yết cho món ăn</DialogTitle>
          </DialogHeader>
          <div className="space-y-3.5 py-2">
            <div>
              <label className="text-xs font-semibold text-slate-700">Món ăn & Biến thể</label>
              <select
                value={variantId}
                onChange={(e) => setVariantId(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium"
              >
                {variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.product.name} — {v.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Giá bán (₫)</label>
              <Input
                type="number"
                placeholder="55000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 font-mono font-bold"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-slate-700">Bắt đầu áp dụng</label>
                <Input
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className="mt-1 text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">
                  Kết thúc (Để trống = Vĩnh viễn)
                </label>
                <Input
                  type="datetime-local"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  className="mt-1 text-xs"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>
              Huỷ
            </Button>
            <Button
              size="sm"
              onClick={() => void handleCreatePrice()}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              Lưu bảng giá
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
