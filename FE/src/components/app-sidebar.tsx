'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import {
  LayoutDashboard,
  ShoppingBag,
  ChefHat,
  UtensilsCrossed,
  Package,
  Users,
  Search,
  ChevronDown,
  ChevronRight,
  Flame,
  CalendarDays,
  TicketPercent,
  ShieldAlert,
  SlidersHorizontal,
  ExternalLink,
  CheckCircle2,
} from 'lucide-react';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import type { Actor } from '@/lib/auth';

export function AppSidebar({ actor }: { actor: Actor }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentInvTab = searchParams.get('tab') || 'stock';
  const [ecomOpen, setEcomOpen] = useState(true);
  const [catalogOpen, setCatalogOpen] = useState(true);
  const [inventoryOpen, setInventoryOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const canReports = actor.permissions.includes('reports.read');
  const canOrders = actor.permissions.includes('orders.create');
  const canOrdersRead = actor.permissions.includes('orders.read');
  const canKds = actor.permissions.includes('fulfillment.read');
  const canCatalog =
    actor.permissions.includes('catalog.manage') || actor.permissions.includes('catalog.read');
  const canInventory = actor.permissions.includes('inventory.read');
  const canTeam = actor.permissions.includes('identity.read');
  const canTables =
    actor.permissions.includes('tables.manage') ||
    actor.permissions.includes('reservations.manage');
  const canCampaigns =
    actor.permissions.includes('campaigns.manage') || actor.permissions.includes('campaigns.read');
  const canSettings = actor.permissions.includes('settings.manage');
  const canAudit = actor.permissions.includes('audit.read');

  const matchesSearch = (label: string) => {
    if (!searchQuery.trim()) return true;
    return label.toLowerCase().includes(searchQuery.trim().toLowerCase());
  };

  return (
    <Sidebar collapsible="offcanvas" className="border-r border-slate-200/90 bg-white font-sans">
      {/* Brand Header */}
      <SidebarHeader className="p-4 border-b border-slate-100">
        <Link href="/admin" className="flex items-center gap-3">
          <div className="size-9 rounded-xl bg-gradient-to-tr from-amber-500 via-amber-400 to-yellow-300 flex items-center justify-center text-slate-900 shadow-sm shadow-amber-500/20 font-black">
            <Flame className="size-5 fill-slate-950 text-slate-950" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
              Chick Res
              <span className="text-[10px] font-semibold bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-mono">
                QSR
              </span>
            </h2>
            <p className="text-[11px] text-slate-500 truncate">Hệ thống Điều hành Gà Rán</p>
          </div>
        </Link>

        {/* Functional Quick Filter */}
        <div className="mt-3 relative">
          <Search className="size-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Lọc nhanh menu..."
            className="w-full h-8 pl-8 pr-2.5 rounded-lg bg-slate-50 border border-slate-200/80 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-amber-400 focus:bg-white transition-all"
          />
        </div>
      </SidebarHeader>

      {/* Navigation Groups */}
      <SidebarContent className="px-2 py-3 space-y-4">
        {/* Group: Dashboards & Operations */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2 mb-1">
            VẬN HÀNH BÁN HÀNG
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">
              {/* Dashboard & Reports Submenu */}
              {(canReports || canOrdersRead) &&
                matchesSearch('Bảng điều hành Tổng quan Sổ đơn hàng Báo cáo') && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => setEcomOpen(!ecomOpen)}
                      className="w-full justify-between hover:bg-slate-50 font-medium text-xs text-slate-700"
                    >
                      <div className="flex items-center gap-2.5">
                        <LayoutDashboard className="size-4 text-amber-500" />
                        <span>Bảng điều hành</span>
                      </div>
                      {ecomOpen ? (
                        <ChevronDown className="size-3.5 text-slate-400" />
                      ) : (
                        <ChevronRight className="size-3.5 text-slate-400" />
                      )}
                    </SidebarMenuButton>

                    {ecomOpen && (
                      <SidebarMenuSub className="ml-5 pl-2.5 border-l border-slate-200/80 space-y-1 my-1">
                        {canReports && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={pathname === '/admin'}>
                              <Link
                                href="/admin"
                                className={`flex items-center gap-2 text-xs py-1.5 px-2 rounded-md transition-colors ${
                                  pathname === '/admin'
                                    ? 'bg-amber-50 text-amber-900 font-bold border-r-2 border-amber-500'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                                }`}
                              >
                                <span>Tổng quan kinh doanh</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}

                        {canOrdersRead && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={pathname === '/orders'}>
                              <Link
                                href="/orders"
                                className={`flex items-center justify-between text-xs py-1.5 px-2 rounded-md transition-colors ${
                                  pathname === '/orders'
                                    ? 'bg-amber-50 text-amber-900 font-bold border-r-2 border-amber-500'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                                }`}
                              >
                                <span>Sổ đơn hàng (Orders)</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}

                        {canReports && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={pathname === '/admin/reports'}>
                              <Link
                                href="/admin/reports"
                                className={`flex items-center justify-between text-xs py-1.5 px-2 rounded-md transition-colors ${
                                  pathname === '/admin/reports'
                                    ? 'bg-amber-50 text-amber-900 font-bold border-r-2 border-amber-500'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                                }`}
                              >
                                <span>Báo cáo & Xuất file</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                      </SidebarMenuSub>
                    )}
                  </SidebarMenuItem>
                )}

              {/* POS Touch */}
              {canOrders && matchesSearch('Quầy bán hàng POS') && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === '/pos'}>
                    <Link
                      href="/pos"
                      className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                        pathname === '/pos'
                          ? 'bg-amber-50 text-amber-900 border-r-2 border-amber-500 font-bold'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <ShoppingBag className="size-4 text-amber-600" />
                        <span>Quầy bán hàng (POS)</span>
                      </div>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                        Live
                      </span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {/* Kitchen KDS */}
              {canKds && matchesSearch('Màn hình bếp KDS chiên đóng gói') && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname.startsWith('/kds')}>
                    <Link
                      href="/kds/frying"
                      className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                        pathname.startsWith('/kds')
                          ? 'bg-amber-50 text-amber-900 border-r-2 border-amber-500 font-bold'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <ChefHat className="size-4 text-amber-600" />
                        <span>Màn hình bếp (KDS)</span>
                      </div>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {/* Tables & Reservations (Unified) */}
              {canTables && matchesSearch('Bàn Đặt chỗ QR Lịch sử') && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname.startsWith('/admin/tables')}>
                    <Link
                      href="/admin/tables"
                      className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                        pathname.startsWith('/admin/tables')
                          ? 'bg-amber-50 text-amber-900 border-r-2 border-amber-500 font-bold'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <CalendarDays className="size-4 text-amber-600" />
                        <span>Bàn & Lịch sử Đặt chỗ</span>
                      </div>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                        Gộp
                      </span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {/* Campaigns & Vouchers */}
              {canCampaigns && matchesSearch('Khuyến mãi Voucher Chiến dịch') && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname.startsWith('/admin/campaigns')}>
                    <Link
                      href="/admin/campaigns"
                      className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                        pathname.startsWith('/admin/campaigns')
                          ? 'bg-amber-50 text-amber-900 border-r-2 border-amber-500 font-bold'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <TicketPercent className="size-4 text-amber-600" />
                        <span>Khuyến mãi & Voucher</span>
                      </div>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                        %
                      </span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Group: Catalog & Inventory Management */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2 mb-1">
            QUẢN TRỊ & NGUYÊN LIỆU
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">
              {/* Menu & Catalog */}
              {canCatalog &&
                matchesSearch('Thực đơn Combo Món ăn Danh mục Bảng giá Tuỳ chọn sốt') && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => setCatalogOpen(!catalogOpen)}
                      className="w-full justify-between hover:bg-slate-50 font-medium text-xs text-slate-700"
                    >
                      <div className="flex items-center gap-2.5">
                        <UtensilsCrossed className="size-4 text-amber-600" />
                        <span>Thực đơn & Bảng giá</span>
                      </div>
                      {catalogOpen ? (
                        <ChevronDown className="size-3.5 text-slate-400" />
                      ) : (
                        <ChevronRight className="size-3.5 text-slate-400" />
                      )}
                    </SidebarMenuButton>

                    {catalogOpen && (
                      <SidebarMenuSub className="ml-5 pl-2.5 border-l border-slate-200/80 space-y-1 my-1">
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            asChild
                            isActive={pathname === '/admin/catalog/products'}
                          >
                            <Link
                              href="/admin/catalog/products"
                              className={`flex items-center gap-2 text-xs py-1.5 px-2 rounded-md transition-colors ${
                                pathname === '/admin/catalog/products'
                                  ? 'bg-amber-50 text-amber-900 font-bold border-r-2 border-amber-500'
                                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                              }`}
                            >
                              <span>Danh sách món ăn</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>

                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            asChild
                            isActive={pathname === '/admin/catalog/categories'}
                          >
                            <Link
                              href="/admin/catalog/categories"
                              className={`flex items-center gap-2 text-xs py-1.5 px-2 rounded-md transition-colors ${
                                pathname === '/admin/catalog/categories'
                                  ? 'bg-amber-50 text-amber-900 font-bold border-r-2 border-amber-500'
                                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                              }`}
                            >
                              <span>Danh mục món</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>

                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            asChild
                            isActive={pathname === '/admin/catalog/option-groups'}
                          >
                            <Link
                              href="/admin/catalog/option-groups"
                              className={`flex items-center gap-2 text-xs py-1.5 px-2 rounded-md transition-colors ${
                                pathname === '/admin/catalog/option-groups'
                                  ? 'bg-amber-50 text-amber-900 font-bold border-r-2 border-amber-500'
                                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                              }`}
                            >
                              <span>Nhóm tuỳ chọn sốt</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>

                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            asChild
                            isActive={pathname === '/admin/catalog/price-schedules'}
                          >
                            <Link
                              href="/admin/catalog/price-schedules"
                              className={`flex items-center gap-2 text-xs py-1.5 px-2 rounded-md transition-colors ${
                                pathname === '/admin/catalog/price-schedules'
                                  ? 'bg-amber-50 text-amber-900 font-bold border-r-2 border-amber-500'
                                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                              }`}
                            >
                              <span>Lịch giá & Khung giờ</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      </SidebarMenuSub>
                    )}
                  </SidebarMenuItem>
                )}

              {/* Inventory & BOM (Expandable Functional Submenu) */}
              {canInventory &&
                matchesSearch('Kho Định mức BOM Nguyên liệu Lô Nhập Kiểm kê Sổ cái') && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => setInventoryOpen(!inventoryOpen)}
                      className="w-full justify-between hover:bg-slate-50 font-medium text-xs text-slate-700"
                    >
                      <div className="flex items-center gap-2.5">
                        <Package className="size-4 text-amber-600" />
                        <span>Kho & Định mức (BOM)</span>
                      </div>
                      {inventoryOpen ? (
                        <ChevronDown className="size-3.5 text-slate-400" />
                      ) : (
                        <ChevronRight className="size-3.5 text-slate-400" />
                      )}
                    </SidebarMenuButton>

                    {inventoryOpen && (
                      <SidebarMenuSub className="ml-5 pl-2.5 border-l border-slate-200/80 space-y-1 my-1">
                        {[
                          { key: 'stock', label: '1. Tồn kho & Cảnh báo' },
                          { key: 'receive', label: '2. Nhập kho theo lô' },
                          { key: 'move', label: '3. Xuất · Kiểm kê · Hủy' },
                          { key: 'ledger', label: '4. Sổ cái Thẻ kho' },
                          { key: 'recipes', label: '5. Định mức món (BOM)' },
                          { key: 'setup', label: '6. Nguyên liệu & Vị trí' },
                        ].map((sub) => {
                          const isActive =
                            pathname === '/admin/inventory' && currentInvTab === sub.key;
                          return (
                            <SidebarMenuSubItem key={sub.key}>
                              <SidebarMenuSubButton asChild isActive={isActive}>
                                <Link
                                  href={`/admin/inventory?tab=${sub.key}`}
                                  className={`flex items-center gap-2 text-xs py-1.5 px-2 rounded-md transition-colors ${
                                    isActive
                                      ? 'bg-amber-50 text-amber-900 font-bold border-r-2 border-amber-500'
                                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                                  }`}
                                >
                                  <span>{sub.label}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          );
                        })}
                      </SidebarMenuSub>
                    )}
                  </SidebarMenuItem>
                )}

              {/* Team & HR */}
              {canTeam && matchesSearch('Nhân sự Phân quyền Tài khoản') && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === '/admin/team'}>
                    <Link
                      href="/admin/team"
                      className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                        pathname === '/admin/team'
                          ? 'bg-amber-50 text-amber-900 border-r-2 border-amber-500 font-bold'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Users className="size-4 text-amber-600" />
                        <span>Nhân sự & Phân quyền</span>
                      </div>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {/* Audit Logs */}
              {canAudit && matchesSearch('Nhật ký Audit Bảo mật') && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === '/admin/audit'}>
                    <Link
                      href="/admin/audit"
                      className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                        pathname === '/admin/audit'
                          ? 'bg-amber-50 text-amber-900 border-r-2 border-amber-500 font-bold'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <ShieldAlert className="size-4 text-amber-600" />
                        <span>Nhật ký Audit</span>
                      </div>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {/* Settings */}
              {canSettings && matchesSearch('Cài đặt cửa hàng Cấu hình') && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === '/admin/settings'}>
                    <Link
                      href="/admin/settings"
                      className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                        pathname === '/admin/settings'
                          ? 'bg-amber-50 text-amber-900 border-r-2 border-amber-500 font-bold'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <SlidersHorizontal className="size-4 text-amber-600" />
                        <span>Cài đặt cửa hàng</span>
                      </div>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Group: Public Customer Portal Shortcuts */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2 mb-1">
            CỔNG KHÁCH HÀNG (PUBLIC)
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link
                    href="/reservations"
                    target="_blank"
                    className="flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  >
                    <span>Trang Đặt Bàn Online</span>
                    <ExternalLink className="size-3 text-slate-400" />
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link
                    href="/vouchers"
                    target="_blank"
                    className="flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  >
                    <span>Trang Săn Voucher</span>
                    <ExternalLink className="size-3 text-slate-400" />
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Clean System Status Footer */}
      <SidebarFooter className="p-3 border-t border-slate-100">
        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 border border-slate-200/70">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-600">
            <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
            <span>Hệ thống POS/KDS đồng bộ</span>
          </div>
          <span className="text-[10px] font-mono text-slate-400">v2.0</span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
