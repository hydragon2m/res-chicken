import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../identity/types/authenticated-user.js';
import { AuditService } from './audit.service.js';

describe('AuditService', () => {
  const actor: AuthenticatedUser = {
    id: '2c7b2271-6d78-4a7b-bd17-4a2ec0c155d1',
    email: 'admin@example.com',
    role: 'ADMIN' as const,
    isPlatformAdmin: false,
    authVersion: 1,
    sessionId: 'session-id',
    permissions: ['audit.read'],
    storeIds: ['b7f5ea29-c72a-4c56-90c1-c4f4ee9223d8'],
  };

  it('limits audit queries to an assigned store and forwards filters', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new AuditService({ auditLog: { findMany } } as never);

    await service.list(actor, {
      storeId: actor.storeIds[0],
      action: 'PAYMENT_REFUNDED',
      take: 20,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: actor.storeIds[0],
          action: 'PAYMENT_REFUNDED',
        }),
        take: 20,
      }),
    );
  });

  it('rejects a store outside the actor scope before querying', async () => {
    const findMany = vi.fn();
    const service = new AuditService({ auditLog: { findMany } } as never);

    await expect(
      service.list(actor, { storeId: '1a9d09f9-a902-45f4-9e9b-fc73c5df0865', take: 50 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(findMany).not.toHaveBeenCalled();
  });
});
