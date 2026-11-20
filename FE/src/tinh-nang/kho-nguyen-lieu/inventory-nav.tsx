'use client';

import Link from 'next/link';
import {
  PackageCheck,
  ArrowDownToLine,
  ArrowLeftRight,
  ClipboardCheck,
  Trash2,
  BookOpen,
  CookingPot,
  Layers,
  Building2,
  AlertTriangle,
} from 'lucide-react';
import type { InventorySectionKey, InventoryAlerts } from '@/tinh-nang/kho-nguyen-lieu/types';

interface InventoryNavProps {
  currentSection: InventorySectionKey;
  alerts?: InventoryAlerts;
  canManage: boolean;
}

export function InventoryNav({ currentSection, alerts, canManage }: InventoryNavProps) {
  const totalAlerts = (alerts?.lowStock.length ?? 0) + (alerts?.nearExpiry.length ?? 0);

  const navItems: Array<{
    key: InventorySectionKey;
    label: string;
    sublabel: string;
    href: string;
    icon: typeof PackageCheck;
    badge?: number | string;
    badgeColor?: string;
    requiresManage?: boolean;
  }> = [
    {
      key: 'stock',
      label: 'Tồn kho & Cảnh báo',
      sublabel: 'Tra cứu theo lô & vị trí',
      href: '/admin/inventory/stock',
      icon: PackageCheck,
      badge: totalAlerts > 0 ? totalAlerts : undefined,
      badgeColor: 'bg-rose-500 text-white',
    },
    {
      key: 'receive',
      label: 'Nhập kho theo lô',
      sublabel: 'PO & Quản lý hạn FEFO',
      href: '/admin/inventory/receive',
      icon: ArrowDownToLine,
      badge: alerts?.todayReceived.length ? `+${alerts.todayReceived.length}` : undefined,
      badgeColor: 'bg-emerald-600 text-white',
      requiresManage: true,
    },
    {
      key: 'transfer',
      label: 'Điều chuyển nội bộ',
      sublabel: 'Kho lưu trữ ➔ Quầy bar/Bếp',
      href: '/admin/inventory/transfer',
      icon: ArrowLeftRight,
      requiresManage: true,
    },
    {
      key: 'audit',
      label: 'Kiểm kê cân kho',
      sublabel: 'Chốt số thực đếm & bù trừ',
      href: '/admin/inventory/audit',
      icon: ClipboardCheck,
      requiresManage: true,
    },
    {
      key: 'waste',
      label: 'Xuất hủy hao hụt',
      sublabel: 'Hỏng hóc, rơi vỡ, hết hạn',
      href: '/admin/inventory/waste',
      icon: Trash2,
      badge: alerts?.nearExpiry.filter((x) => x.isExpired).length || undefined,
      badgeColor: 'bg-rose-600 text-white',
      requiresManage: true,
    },
    {
      key: 'ledger',
      label: 'Sổ cái Thẻ kho',
      sublabel: 'Lịch sử dòng biến động',
      href: '/admin/inventory/ledger',
      icon: BookOpen,
    },
    {
      key: 'recipes',
      label: 'Định mức món (BOM)',
      sublabel: 'Công thức trừ kho tự động',
      href: '/admin/inventory/recipes',
      icon: CookingPot,
      requiresManage: true,
    },
    {
      key: 'ingredients',
      label: 'Nguyên liệu & Vị trí',
      sublabel: 'Danh mục, đơn vị, ngưỡng an toàn',
      href: '/admin/inventory/ingredients',
      icon: Layers,
      requiresManage: true,
    },
    {
      key: 'suppliers',
      label: 'Nhà cung cấp',
      sublabel: 'Danh bạ đối tác cung ứng',
      href: '/admin/inventory/suppliers',
      icon: Building2,
      requiresManage: true,
    },
  ];

  const visibleItems = navItems.filter((item) => !item.requiresManage || canManage);

  return (
    <nav className="w-full bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-1.5 overflow-x-auto">
      <div className="flex items-center gap-1.5 min-w-max">
        {visibleItems.map((item) => {
          const isActive = currentSection === item.key;
          const Icon = item.icon;
          return (
            <Link
              key={item.key}
              href={item.href}
              className={`group flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                isActive
                  ? 'bg-amber-500 text-white shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
            >
              <div
                className={`size-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                  isActive
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-100 text-slate-500 group-hover:bg-amber-100 group-hover:text-amber-700'
                }`}
              >
                <Icon className="size-4" />
              </div>

              <div className="text-left">
                <div className="flex items-center gap-1.5">
                  <span className="leading-tight">{item.label}</span>
                  {item.badge !== undefined && (
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                        isActive ? 'bg-white text-amber-700' : item.badgeColor ?? 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </div>
                <p
                  className={`text-[10px] font-normal leading-tight hidden lg:block ${
                    isActive ? 'text-amber-100' : 'text-slate-400'
                  }`}
                >
                  {item.sublabel}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
