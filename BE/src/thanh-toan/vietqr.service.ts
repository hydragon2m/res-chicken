import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type VietQrGeneratedCode = {
  amount: string | number;
  content: string;
  orderId: string;
  qrCode: string;
  qrLink?: string;
};

@Injectable()
export class VietQrService {
  constructor(private readonly config: ConfigService) {}

  async generateDynamicCode(input: {
    amount: number;
    content: string;
    orderReference: string;
  }): Promise<VietQrGeneratedCode> {
    if (this.config.get<string>('VIETQR_ENABLED') !== 'true')
      throw new ServiceUnavailableException('VietQR payments are disabled.');
    const username = this.required('VIETQR_API_USERNAME');
    const password = this.required('VIETQR_API_PASSWORD');
    const bankCode = this.required('VIETQR_BANK_CODE');
    const bankAccount = this.required('VIETQR_BANK_ACCOUNT');
    const accountName = this.required('VIETQR_ACCOUNT_NAME');
    const baseUrl = this.config.get<string>('VIETQR_API_BASE_URL') ?? 'https://dev.vietqr.org';
    const authorization = Buffer.from(`${username}:${password}`).toString('base64');

    const tokenResponse = await this.request(`${baseUrl}/vqr/api/token_generate`, {
      method: 'POST',
      headers: { Authorization: `Basic ${authorization}` },
    });
    const token = this.stringField(tokenResponse, 'access_token');
    const generated = await this.request(`${baseUrl}/vqr/api/qr/generate-customer`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        bankCode,
        bankAccount,
        userBankName: accountName,
        content: input.content,
        qrType: 0,
        amount: input.amount,
        orderId: input.orderReference,
        transType: 'C',
      }),
    });

    const qrCode = this.stringField(generated, 'qrCode');
    const content = this.stringField(generated, 'content');
    const orderId = this.stringField(generated, 'orderId');
    const amount = this.stringField(generated, 'amount');
    if (
      orderId !== input.orderReference ||
      (!content.includes(input.content) && content !== input.content) ||
      Number(amount) !== input.amount
    )
      throw new BadGatewayException(
        'VietQR returned data that does not match the payment request.',
      );
    return {
      amount,
      content,
      orderId,
      qrCode,
      qrLink: typeof generated.qrLink === 'string' ? generated.qrLink : undefined,
    };
  }

  private async request(url: string, init: RequestInit): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers: { 'content-type': 'application/json', ...init.headers },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new ServiceUnavailableException('Unable to reach VietQR. Try again shortly.');
    }
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok || !body || typeof body !== 'object')
      throw new BadGatewayException('VietQR rejected the payment request.');
    return body as Record<string, unknown>;
  }

  private required(key: string): string {
    const value = this.config.get<string>(key)?.trim();
    if (!value) throw new ServiceUnavailableException(`VietQR is not configured (${key}).`);
    return value;
  }

  private stringField(body: Record<string, unknown>, key: string): string {
    const value = body[key];
    if (typeof value !== 'string' && typeof value !== 'number')
      throw new BadGatewayException(`VietQR response is missing ${key}.`);
    return String(value);
  }
}
