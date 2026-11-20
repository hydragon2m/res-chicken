import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { TableStatus } from '@prisma/client';
import { CurrentUser } from '../xac-thuc-phan-quyen/bo-trang-tri/current-user.decorator.js';
import { RequirePermissions } from '../xac-thuc-phan-quyen/bo-trang-tri/require-permissions.decorator.js';
import type { AuthenticatedUser } from '../xac-thuc-phan-quyen/kieu-du-lieu/authenticated-user.js';
import { CreateTableDto, UpdateTableDto } from './du-lieu-dau-vao/create-table.dto.js';
import { CreateReservationDto, UpdateReservationStatusDto } from './du-lieu-dau-vao/create-reservation.dto.js';
import { TablesService } from './tables.service.js';

@Controller('tables')
export class TablesController {
  constructor(private readonly tables: TablesService) {}

  @RequirePermissions('tables.manage')
  @Get()
  listTables(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('storeId', new ParseUUIDPipe()) storeId: string,
  ) {
    return this.tables.listTables(actor, storeId);
  }

  @RequirePermissions('tables.manage')
  @Post()
  createTable(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateTableDto) {
    return this.tables.createTable(actor, dto);
  }

  @RequirePermissions('tables.manage')
  @Patch(':id')
  updateTable(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateTableDto,
  ) {
    return this.tables.updateTable(actor, id, dto);
  }

  @RequirePermissions('tables.manage')
  @Patch(':id/status')
  setTableStatus(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body('status') status: TableStatus,
  ) {
    return this.tables.setTableStatus(actor, id, status);
  }

  @RequirePermissions('tables.manage')
  @Post(':id/regenerate-qr')
  regenerateQrToken(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.tables.regenerateQrToken(actor, id);
  }
}

@Controller('reservations')
export class ReservationsController {
  constructor(private readonly tables: TablesService) {}

  @RequirePermissions('reservations.manage')
  @Get()
  listReservations(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('storeId', new ParseUUIDPipe()) storeId: string,
    @Query('date') date?: string,
  ) {
    return this.tables.listReservations(actor, storeId, date);
  }

  @RequirePermissions('reservations.manage')
  @Post()
  createReservation(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateReservationDto) {
    return this.tables.createReservation(actor, dto);
  }

  @RequirePermissions('reservations.manage')
  @Patch(':id/status')
  updateStatus(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateReservationStatusDto,
  ) {
    return this.tables.updateReservationStatus(actor, id, dto);
  }
}
