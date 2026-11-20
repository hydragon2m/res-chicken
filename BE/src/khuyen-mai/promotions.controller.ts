import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CampaignStatus } from '@prisma/client';
import { CurrentUser } from '../xac-thuc-phan-quyen/bo-trang-tri/current-user.decorator.js';
import { Public } from '../xac-thuc-phan-quyen/bo-trang-tri/public.decorator.js';
import { RequirePermissions } from '../xac-thuc-phan-quyen/bo-trang-tri/require-permissions.decorator.js';
import type { AuthenticatedUser } from '../xac-thuc-phan-quyen/kieu-du-lieu/authenticated-user.js';
import { CreateCampaignDto } from './du-lieu-dau-vao/create-campaign.dto.js';
import { GenerateVouchersDto } from './du-lieu-dau-vao/generate-vouchers.dto.js';
import { UpdateCampaignDto } from './du-lieu-dau-vao/update-campaign.dto.js';
import { ValidateVoucherDto } from './du-lieu-dau-vao/validate-voucher.dto.js';
import { PromotionsService } from './promotions.service.js';

@Controller('campaigns')
export class PromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  @RequirePermissions('campaigns.read')
  @Get()
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('storeId', new ParseUUIDPipe()) storeId: string,
  ) {
    return this.promotions.list(actor, storeId);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get('public')
  listPublic(@Query('storeId') storeId?: string) {
    return this.promotions.listPublic(storeId);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('validate-voucher')
  validateVoucher(@Body() dto: ValidateVoucherDto) {
    return this.promotions.validateVoucher(dto);
  }

  @RequirePermissions('campaigns.read')
  @Get(':id')
  get(@CurrentUser() actor: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.promotions.get(actor, id);
  }

  @RequirePermissions('campaigns.manage')
  @Post()
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateCampaignDto) {
    return this.promotions.create(actor, dto);
  }

  @RequirePermissions('campaigns.manage')
  @Patch(':id')
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    return this.promotions.update(actor, id, dto);
  }

  @RequirePermissions('campaigns.manage')
  @Post(':id/publish')
  publish(@CurrentUser() actor: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.promotions.setStatus(actor, id, CampaignStatus.PUBLISHED);
  }

  @RequirePermissions('campaigns.manage')
  @Post(':id/disable')
  disable(@CurrentUser() actor: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.promotions.setStatus(actor, id, CampaignStatus.DISABLED);
  }

  @RequirePermissions('campaigns.manage')
  @Post(':id/vouchers')
  generateVouchers(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: GenerateVouchersDto,
  ) {
    return this.promotions.generateVouchers(actor, id, dto);
  }

  @RequirePermissions('campaigns.read')
  @Get(':id/vouchers')
  listVouchers(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.promotions.listVouchers(actor, id);
  }
}
