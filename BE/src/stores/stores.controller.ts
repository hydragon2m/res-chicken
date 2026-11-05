import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CurrentUser } from '../identity/decorators/current-user.decorator.js';
import { Public } from '../identity/decorators/public.decorator.js';
import { RequirePermissions } from '../identity/decorators/require-permissions.decorator.js';
import type { AuthenticatedUser } from '../identity/types/authenticated-user.js';
import { CreateCashRegisterDto, CreateStoreDto } from './dto/create-store.dto.js';
import { StoresService } from './stores.service.js';

@Controller('stores')
export class StoresController {
  constructor(private readonly stores: StoresService) {}

  @Public()
  @Get('public')
  listPublic() {
    return this.stores.listPublic();
  }

  @RequirePermissions('platform.stores.manage')
  @Get()
  list(@CurrentUser() actor: AuthenticatedUser) {
    return this.stores.list(actor);
  }

  @RequirePermissions('platform.stores.manage')
  @Post()
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateStoreDto) {
    return this.stores.create(actor, dto);
  }

  @RequirePermissions('settings.manage')
  @Get(':storeId/registers')
  registers(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('storeId', new ParseUUIDPipe()) storeId: string,
  ) {
    return this.stores.listRegisters(actor, storeId);
  }

  @RequirePermissions('settings.manage')
  @Post('registers')
  createRegister(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateCashRegisterDto) {
    return this.stores.createRegister(actor, dto);
  }
}
