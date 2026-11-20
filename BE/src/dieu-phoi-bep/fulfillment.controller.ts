import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../xac-thuc-phan-quyen/bo-trang-tri/current-user.decorator.js';
import { RequirePermissions } from '../xac-thuc-phan-quyen/bo-trang-tri/require-permissions.decorator.js';
import type { AuthenticatedUser } from '../xac-thuc-phan-quyen/kieu-du-lieu/authenticated-user.js';
import { ListTicketsDto } from './du-lieu-dau-vao/list-tickets.dto.js';
import { TransitionTicketDto } from './du-lieu-dau-vao/transition-ticket.dto.js';
import { FulfillmentService } from './fulfillment.service.js';

@Controller('fulfillment')
export class FulfillmentController {
  constructor(private readonly fulfillment: FulfillmentService) {}

  @RequirePermissions('fulfillment.read')
  @Get('tickets')
  list(@CurrentUser() actor: AuthenticatedUser, @Query() dto: ListTicketsDto) {
    return this.fulfillment.list(actor, dto.storeId, dto.status);
  }

  @RequirePermissions('fulfillment.read')
  @Get('tickets/:ticketId')
  get(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('ticketId', new ParseUUIDPipe()) ticketId: string,
  ) {
    return this.fulfillment.get(actor, ticketId);
  }

  @RequirePermissions('fulfillment.manage')
  @Post('tickets/:ticketId/transition')
  transition(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('ticketId', new ParseUUIDPipe()) ticketId: string,
    @Body() dto: TransitionTicketDto,
  ) {
    return this.fulfillment.transition(actor, ticketId, dto);
  }

  @RequirePermissions('fulfillment.manage')
  @Post('tickets/:ticketId/status')
  statusAlias(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('ticketId', new ParseUUIDPipe()) ticketId: string,
    @Body() dto: TransitionTicketDto,
  ) {
    return this.fulfillment.transition(actor, ticketId, dto);
  }

  @RequirePermissions('fulfillment.manage')
  @Post('tickets/:ticketId/void')
  voidAlias(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('ticketId', new ParseUUIDPipe()) ticketId: string,
    @Body() dto: { reason?: string; note?: string },
  ) {
    return this.fulfillment.transition(actor, ticketId, {
      status: 'VOIDED' as any,
      note: dto.reason || dto.note || 'Kitchen void',
    });
  }
}
