import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { VietQrService } from './vietqr.service.js';

describe('VietQrService', () => {
  it('does not call VietQR when runtime configuration disables the integration', async () => {
    const get = vi.fn().mockReturnValue('false');
    const service = new VietQrService({ get } as never);

    await expect(
      service.generateDynamicCode({ amount: 50_000, content: 'CR123', orderReference: 'CR123' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('VIETQR_ENABLED');
  });
});
