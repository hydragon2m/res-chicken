import { Body, Controller, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { CurrentUser } from '../identity/decorators/current-user.decorator.js';
import { Public } from '../identity/decorators/public.decorator.js';
import { RequirePermissions } from '../identity/decorators/require-permissions.decorator.js';
import type { AuthenticatedUser } from '../identity/types/authenticated-user.js';
import { UpdateStoreSettingsDto } from './dto/update-store-settings.dto.js';
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
