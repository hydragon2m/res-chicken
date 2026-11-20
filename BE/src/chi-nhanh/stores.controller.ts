import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../xac-thuc-phan-quyen/bo-trang-tri/current-user.decorator.js';
import { Public } from '../xac-thuc-phan-quyen/bo-trang-tri/public.decorator.js';
import { RequirePermissions } from '../xac-thuc-phan-quyen/bo-trang-tri/require-permissions.decorator.js';
import type { AuthenticatedUser } from '../xac-thuc-phan-quyen/kieu-du-lieu/authenticated-user.js';
import {
  CreateCashRegisterDto,
  CreateStoreDto,
  InterStoreTransferDto,
  SyncStoreDataDto,
  UpdateStoreDto,
} from './du-lieu-dau-vao/create-store.dto.js';
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
  @Get('chain-overview')
  chainOverview(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('range') range?: string,
  ) {
    return this.stores.chainOverview(actor, range);
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

  @RequirePermissions('platform.stores.manage')
  @Patch(':storeId')
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('storeId', new ParseUUIDPipe()) storeId: string,
    @Body() dto: UpdateStoreDto,
  ) {
    return this.stores.update(actor, storeId, dto);
  }

  @RequirePermissions('platform.stores.manage')
  @Post('sync')
  syncData(@CurrentUser() actor: AuthenticatedUser, @Body() dto: SyncStoreDataDto) {
    return this.stores.syncStoreData(actor, dto);
  }

  @RequirePermissions('platform.stores.manage')
  @Post('inter-transfer')
  interStoreTransfer(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: InterStoreTransferDto,
  ) {
    return this.stores.interStoreTransfer(actor, dto);
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
