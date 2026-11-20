/**
 * The domain representation of an order. It deliberately has no Nest or
 * Prisma dependency; persistence rows are rehydrated at the service edge.
 */
export type OrderState = 'AWAITING_PAYMENT' | 'PAID' | 'CANCELLED' | 'REFUNDED';

export type OrderSnapshot = Readonly<{
  id: string;
  storeId: string;
  status: OrderState;
  totalAmount: number;
}>;

export class OrderEntity {
  private constructor(private readonly snapshot: OrderSnapshot) {}

  static rehydrate(snapshot: OrderSnapshot): OrderEntity {
    return new OrderEntity(snapshot);
  }

  get id(): string {
    return this.snapshot.id;
  }

  get storeId(): string {
    return this.snapshot.storeId;
  }

  canBeCancelled(): boolean {
    return this.snapshot.status === 'AWAITING_PAYMENT';
  }

  canAcceptPayment(): boolean {
    return this.snapshot.status === 'AWAITING_PAYMENT';
  }

  canBeRefunded(): boolean {
    return this.snapshot.status === 'PAID';
  }

  hasTotal(amount: number): boolean {
    return amount === this.snapshot.totalAmount;
  }
}

/** Immutable item snapshot stored with an order, not a live catalog product. */
export interface OrderItemEntity {
  id: string;
  orderId: string;
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  unitPrice: number;
  quantity: number;
  optionsSnapshot: unknown;
  lineTotal: number;
}
