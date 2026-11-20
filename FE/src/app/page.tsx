'use client';

import Link from 'next/link';
import { useEffect, useState, type ComponentType } from 'react';
import {
  BarChart3,
  CreditCard,
  ChefHat,
  Receipt,
  UtensilsCrossed,
  Package,
  Users,
  ArrowRight,
  Flame,
  ArrowUpRight,
  CalendarDays,
  TicketPercent,
  QrCode,
} from 'lucide-react';
import { getActor, getDefaultRouteForActor, ROLE_LABELS, type Actor } from '@/thu-vien/auth';

type ModuleCard = {
  href: string;
  permission: string;
  title: string;
  desc: string;
  badge: string;
  icon: ComponentType<{ className?: string }>;
  accentColor: string;
};

const allModules: ModuleCard[] = [
  {
    href: '/admin',
    permission: 'reports.read',
    title: 'Bảng điều hành',
    desc: 'Tổng quan doanh thu, số lượng đơn, trạng thái ca mở và nhật ký vận hành thời gian thực.',
    badge: 'Báo cáo & Tổng quan',
    icon: BarChart3,
    accentColor: 'from-orange-500/20 to-amber-500/20 text-orange-600',
  },
  {
    href: '/pos',
    permission: 'orders.create',
    title: 'Quầy bán hàng (POS)',
    desc: 'Tạo đơn siêu tốc 30s, quản lý ca làm, nạp/rút két tiền mặt và thanh toán VietQR động.',
    badge: 'Bán hàng tại quầy',
    icon: CreditCard,
    accentColor: 'from-amber-500/20 to-yellow-500/20 text-amber-600',
  },
  {
    href: '/kds/frying',
    permission: 'fulfillment.read',
    title: 'Màn hình bếp (KDS)',
    desc: 'Điều phối trạm chiên mẻ và tủ giữ nóng, kiểm soát thời gian chờ phục vụ khách.',
    badge: 'Bếp chiên & Đóng gói',
    icon: ChefHat,
    accentColor: 'from-red-500/20 to-orange-500/20 text-red-600',
  },
  {
    href: '/orders',
    permission: 'orders.read',
    title: 'Tra cứu đơn hàng',
    desc: 'Theo dõi toàn bộ lịch sử đơn hàng, dòng tiền thanh toán và xử lý huỷ/hoàn tiền.',
    badge: 'Sổ đơn hàng',
    icon: Receipt,
    accentColor: 'from-blue-500/20 to-cyan-500/20 text-blue-600',
  },
  {
    href: '/admin/catalog/categories',
    permission: 'catalog.manage',
    title: 'Quản lý thực đơn (Catalog)',
    desc: 'Danh mục món gà giòn, combo linh hoạt, nhóm tuỳ chọn sốt/miếng và bảng giá chi nhánh.',
    badge: 'Thực đơn & Combo',
    icon: UtensilsCrossed,
    accentColor: 'from-emerald-500/20 to-teal-500/20 text-emerald-600',
  },
  {
    href: '/admin/inventory',
    permission: 'inventory.read',
    title: 'Quản lý kho & Định lượng (BOM)',
    desc: 'Sổ cái nhập - xuất - huỷ, cảnh báo hết hạn và công thức định lượng trừ kho theo từng miếng gà.',
    badge: 'Kho & Nguyên liệu',
    icon: Package,
    accentColor: 'from-purple-500/20 to-indigo-500/20 text-purple-600',
  },
  {
    href: '/admin/team',
    permission: 'identity.read',
    title: 'Nhân sự & Phân quyền',
    desc: 'Thiết lập tài khoản nhân viên, phân quyền RBAC và gán phạm vi chi nhánh vận hành.',
    badge: 'Nhân sự & RBAC',
    icon: Users,
    accentColor: 'from-slate-500/20 to-zinc-500/20 text-slate-700',
  },
  {
    href: '/admin/tables',
    permission: 'tables.manage',
    title: 'Sơ đồ bàn & Đặt chỗ',
    desc: 'Quản lý danh sách bàn, trạng thái phục vụ, mã QR gọi món tại bàn và xử lý đặt bàn chống overbook.',
    badge: 'Bàn & Đặt bàn',
    icon: CalendarDays,
    accentColor: 'from-amber-500/20 to-orange-500/20 text-amber-700',
  },
  {
    href: '/admin/campaigns',
    permission: 'campaigns.read',
    title: 'Chiến dịch Khuyến mãi & Voucher',
    desc: 'Quản lý mã giảm giá, phát hành voucher hàng loạt, kiểm soát quota redemption và áp voucher vào đơn.',
    badge: 'Khuyến mãi & Voucher',
    icon: TicketPercent,
    accentColor: 'from-rose-500/20 to-amber-500/20 text-rose-600',
  },
  {
    href: '/reservations',
    permission: 'orders.read',
    title: 'Trang khách Đặt bàn (Public)',
    desc: 'Giao diện cho khách hàng tra cứu khung giờ trống, số lượng khách và gửi yêu cầu đặt chỗ online.',
    badge: 'Public Portal',
    icon: QrCode,
    accentColor: 'from-teal-500/20 to-emerald-500/20 text-teal-700',
  },
];

export default function Home() {
  const [actor, setActor] = useState<Actor | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getActor()
      .then((curr) => {
        setActor(curr);
      })
      .catch(() => {
        setActor(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const permittedModules = actor
    ? allModules.filter((m) => actor.permissions.includes(m.permission))
    : [];

  return (
    <div className="min-h-screen bg-slate-50/60 font-sans pb-16">
      {/* Header Banner */}
      <div className="bg-white border-b border-slate-200/80">
        <div className="w-full px-4 sm:px-8 lg:px-12 py-8 sm:py-10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="space-y-3 max-w-3xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-200/80 text-xs font-semibold text-amber-800">
                <Flame className="size-3.5 text-amber-500 fill-amber-500" />
                Hệ thống Quản lý & Vận hành Nhà hàng Gà Rán Chick Res
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
                Không gian làm việc tập trung
              </h1>
              <p className="text-slate-600 text-sm sm:text-base leading-relaxed">
                Đồng bộ tức thời giữa Quầy thu ngân (POS), Trạm chiên bếp (KDS), Kho nguyên liệu
                (BOM) và Báo cáo doanh thu thời gian thực.
              </p>
            </div>

            {/* Auth / User Status Box */}
            <div className="shrink-0">
              {loading ? (
                <div className="px-5 py-4 rounded-xl bg-slate-100 animate-pulse text-xs text-slate-500">
                  Đang kiểm tra phiên làm việc…
                </div>
              ) : actor ? (
                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col gap-3 min-w-[280px]">
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-400 flex items-center justify-center text-slate-950 font-bold text-sm shadow-xs">
                      {actor.email.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 truncate">{actor.email}</p>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                        <span className="font-medium text-amber-800 bg-amber-50 px-1.5 py-0.2 rounded text-[11px]">
                          {ROLE_LABELS[actor.role] ?? actor.role}
                        </span>
                        <span>•</span>
                        <span>{actor.storeIds.length} chi nhánh</span>
                      </div>
                    </div>
                  </div>
                  <Link
                    href={getDefaultRouteForActor(actor)}
                    className="inline-flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold transition-all shadow-xs"
                  >
                    <span>Vào không gian làm việc chính</span>
                    <ArrowRight className="size-3.5" />
                  </Link>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <Link
                    href="/login"
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-sm font-bold transition-all shadow-sm"
                  >
                    <span>Đăng nhập hệ thống</span>
                    <ArrowRight className="size-4" />
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modules Grid */}
      <div className="w-full px-4 sm:px-8 lg:px-12 pt-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Các phân hệ nghiệp vụ</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {actor
                ? `Tài khoản của bạn được cấp quyền truy cập ${permittedModules.length}/${allModules.length} phân hệ:`
                : 'Chọn phân hệ để làm việc theo vị trí ca trực:'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {(actor ? permittedModules : allModules).map((mod) => {
            const Icon = mod.icon;
            return (
              <Link
                key={mod.href}
                href={mod.href}
                className="group relative flex flex-col justify-between p-6 rounded-2xl bg-white border border-slate-200/90 hover:border-amber-400/80 hover:shadow-md transition-all duration-200 cursor-pointer overflow-hidden"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <div
                      className={`size-11 rounded-xl bg-gradient-to-tr ${mod.accentColor} flex items-center justify-center`}
                    >
                      <Icon className="size-5" />
                    </div>
                    <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
                      {mod.badge}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-slate-900 group-hover:text-amber-700 transition-colors flex items-center gap-1.5">
                    {mod.title}
                    <ArrowUpRight className="size-4 opacity-0 -translate-x-1 translate-y-1 group-hover:opacity-100 group-hover:translate-x-0 group-hover:translate-y-0 transition-all text-amber-600" />
                  </h3>
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed line-clamp-2">
                    {mod.desc}
                  </p>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-amber-700">
                  <span>Mở phân hệ</span>
                  <span className="group-hover:translate-x-1 transition-transform">→</span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
