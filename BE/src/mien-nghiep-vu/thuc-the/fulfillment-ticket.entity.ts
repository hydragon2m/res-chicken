/** State values mirror the persistence schema without importing the ORM. */
export type FulfillmentTicketState = 'QUEUED' | 'PREPARING' | 'READY' | 'HANDED_OVER' | 'VOIDED';

export type FulfillmentTicketSnapshot = Readonly<{
  id: string;
  storeId: string;
  status: FulfillmentTicketState;
}>;

export class FulfillmentTransitionError extends Error {
  constructor(
    readonly code: 'INVALID_TRANSITION' | 'VOID_REASON_REQUIRED',
    message: string,
  ) {
    super(message);
  }
}

const allowedTransitions: Readonly<
  Record<FulfillmentTicketState, readonly FulfillmentTicketState[]>
> = {
  QUEUED: ['PREPARING', 'VOIDED'],
  PREPARING: ['READY', 'VOIDED'],
  READY: ['HANDED_OVER', 'VOIDED'],
  HANDED_OVER: [],
  VOIDED: [],
};

export class FulfillmentTicketEntity {
  private constructor(private state: FulfillmentTicketSnapshot) {}

  static rehydrate(snapshot: FulfillmentTicketSnapshot): FulfillmentTicketEntity {
    return new FulfillmentTicketEntity(snapshot);
  }

  get id(): string {
    return this.state.id;
  }

  get storeId(): string {
    return this.state.storeId;
  }

  get status(): FulfillmentTicketState {
    return this.state.status;
  }

  transitionTo(next: FulfillmentTicketState, note?: string): void {
    if (next === this.state.status) return;
    if (next === 'VOIDED' && !note?.trim()) {
      throw new FulfillmentTransitionError('VOID_REASON_REQUIRED', 'A void reason is required.');
    }
    if (!allowedTransitions[this.state.status].includes(next)) {
      throw new FulfillmentTransitionError(
        'INVALID_TRANSITION',
        `Cannot transition ${this.state.status} to ${next}.`,
      );
    }
    this.state = { ...this.state, status: next };
  }
}
