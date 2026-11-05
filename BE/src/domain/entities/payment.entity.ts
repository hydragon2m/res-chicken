export type PaymentMethodEntity = 'CASH' | 'QR_MANUAL' | 'QR_VIETQR';
export type PaymentState = 'CAPTURED' | 'VOIDED' | 'REFUNDED';

export interface PaymentEntity {
  id: string;
  storeId: string;
  orderId: string;
  shiftId: string | null;
  method: PaymentMethodEntity;
  status: PaymentState;
  amount: number;
  capturedById: string;
  capturedAt: Date;
  refundedById: string | null;
  refundedAt: Date | null;
  refundNote: string | null;
  providerTransactionId: string | null;
}

export interface CashMovementEntity {
  id: string;
  storeId: string;
  shiftId: string;
  paymentId: string | null;
  kind: 'OPENING_FLOAT' | 'CASH_SALE' | 'REFUND' | 'ADJUSTMENT';
  amount: number;
  note: string | null;
  createdAt: Date;
}
export interface IdempotencyRecordEntity {
  id: string;
  storeId: string;
  scope:
    | 'OPEN_SHIFT'
    | 'CLOSE_SHIFT'
    | 'CREATE_ORDER'
    | 'CAPTURE_PAYMENT'
    | 'CANCEL_ORDER'
    | 'REFUND_PAYMENT'
    | 'CASH_ADJUSTMENT'
    | 'RECEIVE_INVENTORY';
  key: string;
  orderId: string | null;
  paymentId: string | null;
  shiftId: string | null;
  receiptId: string | null;
  createdAt: Date;
}
