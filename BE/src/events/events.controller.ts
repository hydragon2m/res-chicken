import { Controller, ForbiddenException, MessageEvent, Post, Query, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { EventsService } from './events.service.js';
import { CurrentUser } from '../identity/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../identity/types/authenticated-user.js';

@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Post('ticket')
  createTicket(@CurrentUser() actor: AuthenticatedUser): { ticket: string } {
    const ticket = this.events.createStreamTicket(actor);
    return { ticket };
  }

  @Sse()
  stream(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('storeId') storeId: string,
  ): Observable<MessageEvent> {
    if (!actor.isPlatformAdmin && !actor.storeIds.includes(storeId))
      throw new ForbiddenException('Store access denied.');
    return this.events.streamForStore(storeId);
  }

  @Sse('stream')
  streamAlias(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('storeId') storeId: string,
  ): Observable<MessageEvent> {
    return this.stream(actor, storeId);
  }
}
