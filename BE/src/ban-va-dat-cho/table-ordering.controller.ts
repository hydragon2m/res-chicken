import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../xac-thuc-phan-quyen/bo-trang-tri/public.decorator.js';
import { TableSelfOrderDto } from './du-lieu-dau-vao/table-order.dto.js';
import { TablesService } from './tables.service.js';

@Controller('ordering/table')
export class TableOrderingController {
  constructor(private readonly tables: TablesService) {}

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Get(':qrToken')
  getTableMenu(@Param('qrToken') qrToken: string) {
    return this.tables.getTableForQrOrder(qrToken);
  }

  @Public()
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @Get(':qrToken/orders')
  getTableOrders(@Param('qrToken') qrToken: string) {
    return this.tables.getTableCurrentOrders(qrToken);
  }

  @Public()
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  @Post(':qrToken')
  placeOrder(
    @Param('qrToken') qrToken: string,
    @Body() dto: TableSelfOrderDto,
    @Headers('idempotency-key') headerKey?: string,
    @Headers('x-idempotency-key') xHeaderKey?: string,
  ) {
    return this.tables.createTableSelfOrder(qrToken, dto, headerKey || xHeaderKey);
  }
}
