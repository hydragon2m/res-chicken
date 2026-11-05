export type ShiftState = 'OPEN' | 'CLOSED';

export type ShiftSnapshot = Readonly<{
  id: string;
  storeId: string;
  status: ShiftState;
}>;

export type ShiftSettlement = Readonly<{
  expectedCash: number;
  declaredCash: number;
  variance: number;
}>;

/** Owns the cash reconciliation calculation for a persisted shift. */
export class ShiftEntity {
  private constructor(private readonly snapshot: ShiftSnapshot) {}

  static rehydrate(snapshot: ShiftSnapshot): ShiftEntity {
    return new ShiftEntity(snapshot);
  }

  isOpen(): boolean {
    return this.snapshot.status === 'OPEN';
  }

  close(declaredCash: number, expectedCash: number): ShiftSettlement {
    if (!this.isOpen()) {
      throw new Error('Shift is already closed.');
    }
    return {
      expectedCash,
      declaredCash,
      variance: declaredCash - expectedCash,
    };
  }
}
