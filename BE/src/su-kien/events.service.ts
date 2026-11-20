import { Injectable, MessageEvent } from '@nestjs/common';
import * as crypto from 'crypto';
import { Observable, Subject, filter, map } from 'rxjs';
import type { AuthenticatedUser } from '../xac-thuc-phan-quyen/kieu-du-lieu/authenticated-user.js';

export type AppRealtimeEvent = {
  storeId: string;
  type:
    | 'order.created'
    | 'order.paid'
    | 'order.cancelled'
    | 'ticket.updated'
    | 'table.updated'
    | 'reservation.created';
  payload: Record<string, unknown>;
  timestamp: string;
};

@Injectable()
export class EventsService {
  private readonly events$ = new Subject<AppRealtimeEvent>();
  private readonly streamTickets = new Map<
    string,
    { user: AuthenticatedUser; expiresAt: number }
  >();

  createStreamTicket(user: AuthenticatedUser): string {
    const ticket = crypto.randomUUID();
    const expiresAt = Date.now() + 60_000;
    this.streamTickets.set(ticket, { user, expiresAt });
    this.cleanupExpiredTickets();
    return ticket;
  }

  consumeStreamTicket(ticket: string): AuthenticatedUser | null {
    const entry = this.streamTickets.get(ticket);
    if (!entry) return null;
    this.streamTickets.delete(ticket);
    if (Date.now() > entry.expiresAt) return null;
    return entry.user;
  }

  private cleanupExpiredTickets() {
    const now = Date.now();
    for (const [ticket, entry] of this.streamTickets.entries()) {
      if (now > entry.expiresAt) {
        this.streamTickets.delete(ticket);
      }
    }
  }

  emit(storeId: string, type: AppRealtimeEvent['type'], payload: Record<string, unknown>) {
    this.events$.next({
      storeId,
      type,
      payload,
      timestamp: new Date().toISOString(),
    });
  }

  streamForStore(storeId: string): Observable<MessageEvent> {
    return this.events$.asObservable().pipe(
      filter((event) => event.storeId === storeId),
      map(
        (event) =>
          ({
            data: JSON.stringify(event),
            type: event.type,
          }) as MessageEvent,
      ),
    );
  }
}
