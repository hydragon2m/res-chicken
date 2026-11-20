import type { FulfillmentTicketState } from './fulfillment-ticket.entity.js';

export interface FulfillmentTicketItemEntity {
  id: string;
  ticketId: string;
  orderItemId: string;
  productName: string;
  variantName: string;
  quantity: number;
  optionsSnapshot: unknown;
}
export interface FulfillmentTicketEventEntity {
  id: string;
  ticketId: string;
  fromStatus: FulfillmentTicketState | null;
  toStatus: FulfillmentTicketState;
  actorId: string;
  note: string | null;
  createdAt: Date;
}
