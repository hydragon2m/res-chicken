import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../identity/decorators/current-user.decorator.js';
import { Public } from '../identity/decorators/public.decorator.js';
import { RequirePermissions } from '../identity/decorators/require-permissions.decorator.js';
import type { AuthenticatedUser } from '../identity/types/authenticated-user.js';
import { Throttle } from '@nestjs/throttler';
import { CapturePaymentDto } from './dto/capture-payment.dto.js';
import { RefundPaymentDto } from './dto/refund-payment.dto.js';
import { VietQrTransactionSyncDto } from './dto/vietqr-transaction-sync.dto.js';
import { PaymentsService } from './payments.service.js';

@Controller('orders/:orderId/payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}
  @RequirePermissions('payments.capture')
  @Post()
  capture(
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('idempotency-key') key: string | undefined,
    @Param('orderId', new ParseUUIDPipe()) orderId: string,
    @Body() dto: CapturePaymentDto,
  ) {
    return this.payments.capture(actor, key, orderId, dto);
  }

  @RequirePermissions('payments.capture')
  @Post('vietqr')
  createVietQrRequest(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('orderId', new ParseUUIDPipe()) orderId: string,
  ) {
    return this.payments.createVietQrRequest(actor, orderId);
  }
}

@Controller('payments')
export class RefundsController {
  constructor(private readonly payments: PaymentsService) {}
  @RequirePermissions('payments.refund')
  @Post(':paymentId/refund')
  refund(
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('idempotency-key') key: string | undefined,
    @Param('paymentId', new ParseUUIDPipe()) paymentId: string,
    @Body() dto: RefundPaymentDto,
  ) {
    return this.payments.refund(actor, key, paymentId, dto);
  }
}

/**
 * This route is deliberately public: VietQR does not have a staff JWT.
 * Authenticity is established through the short-lived Bearer token issued by
 * token-generate after VietQR supplies its configured Basic credential.
 */
@Controller('webhooks/vietqr')
export class VietQrWebhooksController {
  constructor(private readonly payments: PaymentsService) {}

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post(['token-generate', 'token_generate'])
  tokenGenerate(@Headers('authorization') authorization: string | undefined) {
    return this.payments.issueVietQrCallbackToken(authorization);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Post('transaction-sync')
  @HttpCode(HttpStatus.OK)
  async transactionSync(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: VietQrTransactionSyncDto,
  ) {
    await this.payments.assertVietQrCallbackToken(authorization);
    const result = await this.payments.captureVietQr(dto);
    return {
      error: !result.processed,
      errorReason: result.processed ? null : 'NOT_INCOMING_CREDIT',
      toastMessage: result.processed
        ? 'Transaction synchronized.'
        : 'Transaction ignored because it is not an incoming credit.',
      object: result.processed ? { reftransactionid: dto.transactionid } : null,
    };
  }
}
