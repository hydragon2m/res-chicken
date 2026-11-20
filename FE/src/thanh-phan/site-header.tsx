'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Building2, ChevronDown, Globe, LogOut, ShieldCheck, UserCheck } from 'lucide-react';
import { SidebarTrigger } from '@/thanh-phan/giao-dien/sidebar';
import { logout, ROLE_LABELS, type Actor } from '@/thu-vien/auth';
import { useActiveStore } from '@/thu-vien/store-context';

const titles: Record<string, string> = {
  '/admin': 'Bảng Điều Hành Nhà Hàng (Dashboard)',
  '/admin/chain': 'Trung Tâm Điều Hành Chuỗi & Đồng Bộ Đa Chi Nhánh (HQ)',
  '/admin/reports': 'Báo Cáo Doanh Thu & Vận Hành',
  '/pos': 'Quầy Bán Hàng (Touch POS)',
  '/orders': 'Sổ Đơn Hàng & Thanh Toán',
  '/admin/tables': 'Sơ Đồ Bàn, QR Tại Bàn & Đặt Chỗ',
  '/admin/campaigns': 'Chiến Dịch Khuyến Mãi & Mã Voucher',
  '/admin/inventory': 'Kho Nguyên Liệu, Lô Hàng & Định Mức BOM',
  '/admin/team': 'Nhân Sự & Phân Quyền Truy Cập',
  '/admin/audit': 'Nhật Ký Kiểm Toán Bảo Mật (Audit Logs)',
  '/admin/settings': 'Cấu Hình Cửa Hàng & Máy Thu Ngân',
};

export function SiteHeader({ actor }: { actor: Actor }) {
  const pathname = usePathname();
  const router = useRouter();
  const { stores, currentStore, currentStoreId, setCurrentStoreId } = useActiveStore();

  const title = pathname.startsWith('/kds/')
    ? 'Màn Hình Điều Phối Bếp (KDS)'
    : pathname.startsWith('/admin/catalog')
      ? 'Quản Lý Thực Đơn, Món Ăn & Bảng Giá'
      : pathname.startsWith('/admin/inventory')
        ? 'Quản Lý Kho, Lô Hàng & Định Mức BOM'
        : (titles[pathname] ?? 'Hệ Thống Quản Trị Chick Res');

  const handleSignOut = async () => {
    await logout();
    router.replace('/login');
  };

  const userInitial = (actor.email?.[0] ?? 'U').toUpperCase();
  const roleLabel = ROLE_LABELS[actor.role] ?? actor.role;

  return (
    <header className="sticky top-0 z-30 flex h-15 shrink-0 items-center justify-between border-b border-slate-200 bg-white/95 backdrop-blur px-4 md:px-6 font-sans">
      {/* Left: Sidebar trigger + Page Title */}
      <div className="flex items-center gap-3 min-w-0">
        <SidebarTrigger className="-ml-1 text-slate-600 hover:text-slate-900" />
        <div className="h-5 w-px bg-slate-200 hidden sm:block" />
        <div className="min-w-0">
          <h1 className="text-sm font-bold text-slate-900 truncate">{title}</h1>
          <p className="text-[11px] text-slate-500 hidden sm:block truncate">
            {currentStore
              ? `Đang làm việc tại: ${currentStore.name}`
              : 'Đang tải thông tin chi nhánh...'}
          </p>
        </div>
      </div>

      {/* Right: Store Switcher + User Account + Sign Out */}
      <div className="flex items-center gap-2.5 sm:gap-3">
        {/* Store Switcher (Top-Right Standard Placement) */}
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-1.5 shadow-2xs">
          <Building2 className="size-4 text-amber-600 shrink-0" />
          <div className="flex flex-col">
            <span className="text-[9px] font-bold uppercase tracking-wider text-amber-700 leading-none">
              Cửa hàng hiện tại
            </span>
            {stores.length > 1 ? (
              <div className="relative flex items-center">
                <select
                  aria-label="Chọn cửa hàng làm việc"
                  value={currentStoreId}
                  onChange={(e) => setCurrentStoreId(e.target.value)}
                  className="appearance-none bg-transparent pr-5 text-xs font-bold text-slate-900 focus:outline-none cursor-pointer"
                >
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="size-3.5 text-amber-700 pointer-events-none absolute right-0" />
              </div>
            ) : (
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                <span className="text-xs font-bold text-slate-900 truncate max-w-[160px]">
                  {currentStore?.name ?? 'Chick Res Main'}
                </span>
              </div>
            )}
          </div>
          {actor.isPlatformAdmin && (
            <Link
              href="/admin/chain"
              title="Mở Trung tâm Điều hành Chuỗi & Đồng bộ Đa Chi Nhánh"
              className={`ml-1 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold transition-colors ${
                pathname.startsWith('/admin/chain')
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'bg-indigo-100 text-indigo-800 hover:bg-indigo-200'
              }`}
            >
              <Globe className="size-3" />
              <span className="hidden xl:inline">Toàn chuỗi</span>
            </Link>
          )}
        </div>

        <div className="h-6 w-px bg-slate-200 hidden sm:block" />

        {/* Account Profile Pill + Logout Button */}
        <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50/80 pl-2.5 pr-1.5 py-1">
          <div className="size-7 rounded-lg bg-gradient-to-tr from-amber-500 to-yellow-400 text-slate-950 font-extrabold text-xs flex items-center justify-center shadow-2xs shrink-0">
            {userInitial}
          </div>
          <div className="hidden md:flex flex-col min-w-0 pr-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-900 truncate max-w-[170px]">
                {actor.email}
              </span>
            </div>
            <div className="flex items-center gap-1 text-[10px] font-semibold text-amber-700">
              {actor.isPlatformAdmin ? (
                <ShieldCheck className="size-3 text-amber-600 shrink-0" />
              ) : (
                <UserCheck className="size-3 text-slate-500 shrink-0" />
              )}
              <span>{actor.isPlatformAdmin ? 'Super Admin (Toàn hệ thống)' : roleLabel}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            title="Đăng xuất khỏi phiên làm việc"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer"
          >
            <LogOut className="size-3.5" />
            <span className="hidden lg:inline">Đăng xuất</span>
          </button>
        </div>
      </div>
    </header>
  );
}
