import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../identity/decorators/current-user.decorator.js';
import { RequirePermissions } from '../identity/decorators/require-permissions.decorator.js';
import type { AuthenticatedUser } from '../identity/types/authenticated-user.js';
import { ListTicketsDto } from './dto/list-tickets.dto.js';
import { TransitionTicketDto } from './dto/transition-ticket.dto.js';
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
