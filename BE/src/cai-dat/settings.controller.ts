import { Body, Controller, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { CurrentUser } from '../xac-thuc-phan-quyen/bo-trang-tri/current-user.decorator.js';
import { Public } from '../xac-thuc-phan-quyen/bo-trang-tri/public.decorator.js';
import { RequirePermissions } from '../xac-thuc-phan-quyen/bo-trang-tri/require-permissions.decorator.js';
import type { AuthenticatedUser } from '../xac-thuc-phan-quyen/kieu-du-lieu/authenticated-user.js';
import { UpdateStoreSettingsDto } from './du-lieu-dau-vao/update-store-settings.dto.js';
import { SettingsService } from './settings.service.js';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @RequirePermissions('settings.manage')
  @Get('store/:storeId')
  getSettings(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('storeId', new ParseUUIDPipe()) storeId: string,
  ) {
    return this.settings.getStoreSettings(actor, storeId);
  }

  @RequirePermissions('settings.manage')
  @Put('store/:storeId')
  updateSettings(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('storeId', new ParseUUIDPipe()) storeId: string,
    @Body() dto: UpdateStoreSettingsDto,
  ) {
    return this.settings.updateStoreSettings(actor, storeId, dto);
  }

  @Public()
  @Get('store/:storeId/public')
  getPublicInfo(@Param('storeId', new ParseUUIDPipe()) storeId: string) {
    return this.settings.getPublicStoreInfo(storeId);
  }
}
