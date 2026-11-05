import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../identity/decorators/current-user.decorator.js';
import { RequirePermissions } from '../identity/decorators/require-permissions.decorator.js';
import type { AuthenticatedUser } from '../identity/types/authenticated-user.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { CancelOrderDto } from './dto/cancel-order.dto.js';
import { OrderingService } from './ordering.service.js';

@Controller('orders')
export class OrderingController {
  constructor(private readonly ordering: OrderingService) {}

  @RequirePermissions('orders.create')
  @Post()
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: CreateOrderDto,
  ) {
    return this.ordering.create(actor, key, dto);
  }

  @RequirePermissions('orders.cancel')
  @Post(':orderId/cancel')
  cancel(
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('idempotency-key') key: string | undefined,
    @Param('orderId', new ParseUUIDPipe()) orderId: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.ordering.cancel(actor, key, orderId, dto.note);
  }

  @RequirePermissions('orders.read')
  @Get()
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('storeId', new ParseUUIDPipe()) storeId: string,
  ) {
    return this.ordering.list(actor, storeId);
  }

  @RequirePermissions('orders.read')
  @Get(':orderId')
  get(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('orderId', new ParseUUIDPipe()) orderId: string,
  ) {
    return this.ordering.get(actor, orderId);
  }
}
