import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../xac-thuc-phan-quyen/bo-trang-tri/current-user.decorator.js';
import { RequirePermissions } from '../xac-thuc-phan-quyen/bo-trang-tri/require-permissions.decorator.js';
import type { AuthenticatedUser } from '../xac-thuc-phan-quyen/kieu-du-lieu/authenticated-user.js';
import { CloseShiftDto } from './du-lieu-dau-vao/close-shift.dto.js';
import { CreateCashAdjustmentDto } from './du-lieu-dau-vao/create-cash-adjustment.dto.js';
import { OpenShiftDto } from './du-lieu-dau-vao/open-shift.dto.js';
import { ShiftsService } from './shifts.service.js';

@Controller('shifts')
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService) {}
  @RequirePermissions('shifts.read') @Get('current') current(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('storeId', new ParseUUIDPipe()) storeId: string,
    @Query('registerId') registerId?: string,
  ) {
    return this.shifts.current(actor, storeId, registerId);
  }
  @RequirePermissions('shifts.open') @Post('open') open(
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: OpenShiftDto,
  ) {
    return this.shifts.open(actor, key, dto);
  }
  @RequirePermissions('shifts.close') @Post(':shiftId/close') close(
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('idempotency-key') key: string | undefined,
    @Param('shiftId', new ParseUUIDPipe()) shiftId: string,
    @Body() dto: CloseShiftDto,
  ) {
    return this.shifts.close(actor, key, shiftId, dto);
  }
  @RequirePermissions('shifts.adjust') @Post(':shiftId/adjustments') adjustment(
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('idempotency-key') key: string | undefined,
    @Param('shiftId', new ParseUUIDPipe()) shiftId: string,
    @Body() dto: CreateCashAdjustmentDto,
  ) {
    return this.shifts.adjustment(actor, key, shiftId, dto);
  }
}
