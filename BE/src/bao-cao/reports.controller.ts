import { Controller, Get, ParseUUIDPipe, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../xac-thuc-phan-quyen/bo-trang-tri/current-user.decorator.js';
import { RequirePermissions } from '../xac-thuc-phan-quyen/bo-trang-tri/require-permissions.decorator.js';
import type { AuthenticatedUser } from '../xac-thuc-phan-quyen/kieu-du-lieu/authenticated-user.js';
import { ListActivityDto } from './du-lieu-dau-vao/list-activity.dto.js';
import { ReportsService } from './reports.service.js';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @RequirePermissions('reports.read')
  @Get('activity')
  activity(@CurrentUser() actor: AuthenticatedUser, @Query() dto: ListActivityDto) {
    return this.reports.activity(actor, dto.storeId);
  }

  @RequirePermissions('reports.read')
  @Get('sales')
  sales(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('storeId', new ParseUUIDPipe()) storeId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.salesReport(actor, storeId, from, to);
  }

  @RequirePermissions('reports.read')
  @Get('top-selling')
  topSelling(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('storeId', new ParseUUIDPipe()) storeId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reports.topSelling(actor, storeId, from, to, limit ? parseInt(limit, 10) : 10);
  }

  @RequirePermissions('reports.read')
  @Get('shifts')
  shifts(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('storeId', new ParseUUIDPipe()) storeId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.shiftsReport(actor, storeId, from, to);
  }

  @RequirePermissions('reports.read')
  @Get('inventory-waste')
  inventoryWaste(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('storeId', new ParseUUIDPipe()) storeId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.inventoryWasteReport(actor, storeId, from, to);
  }

  @RequirePermissions('reports.read')
  @Get('platform-overview')
  platformOverview(@CurrentUser() actor: AuthenticatedUser) {
    return this.reports.platformOverview(actor);
  }

  @RequirePermissions('reports.read')
  @Get('dashboard-metrics')
  dashboardMetrics(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('storeId', new ParseUUIDPipe()) storeId: string,
    @Query('range') range?: string,
  ) {
    return this.reports.dashboardMetrics(actor, storeId, range);
  }

  @RequirePermissions('reports.export')
  @Get('export/sales')
  async exportSales(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('storeId', new ParseUUIDPipe()) storeId: string,
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const csv = await this.reports.exportSalesCsv(actor, storeId, from, to);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="sales-report-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    res.send(csv);
  }

  @RequirePermissions('reports.export')
  @Get('export/inventory')
  async exportInventory(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('storeId', new ParseUUIDPipe()) storeId: string,
    @Res() res: Response,
  ) {
    const csv = await this.reports.exportInventoryCsv(actor, storeId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="inventory-report-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    res.send(csv);
  }
}
