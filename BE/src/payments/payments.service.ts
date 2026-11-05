import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { timingSafeEqual } from 'node:crypto';
import {
  IdempotencyScope,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  VoucherRedemptionStatus,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { EventsService } from '../events/events.service.js';
import { OrderEntity } from '../domain/entities/order.entity.js';
import type { AuthenticatedUser } from '../identity/types/authenticated-user.js';
import { ShiftsService } from '../shifts/shifts.service.js';
import { FulfillmentService } from '../fulfillment/fulfillment.service.js';
import type { CapturePaymentDto } from './dto/capture-payment.dto.js';
import type { RefundPaymentDto } from './dto/refund-payment.dto.js';
import type { VietQrTransactionSyncDto } from './dto/vietqr-transaction-sync.dto.js';
import { VietQrService } from './vietqr.service.js';

// A payment response is consumed by the POS immediately after capture/refund.
// Include the order's payments as well as its immutable item snapshots so callers
// receive one complete order view rather than a partially populated relation.
const paymentInclude = {
  order: { include: { items: true, payments: true } },
  shift: true,
} satisfies Prisma.PaymentInclude;

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shifts: ShiftsService,
    private readonly fulfillment: FulfillmentService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly vietQr: VietQrService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  async createVietQrRequest(actor: AuthenticatedUser, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found.');
    this.assertStore(actor, order.storeId);
    if (!OrderEntity.rehydrate(order).canAcceptPayment())
      throw new ConflictException('Order has already been paid or cancelled.');

    const existing = await this.prisma.vietQrPaymentRequest.findUnique({ where: { orderId } });
    if (existing) return existing;

    // VietQR accepts at most 13 characters in orderId, while our order ID is a UUID.
    const orderReference = `CR${order.id.replaceAll('-', '').slice(0, 11).toUpperCase()}`;
    const generated = await this.vietQr.generateDynamicCode({
      amount: order.totalAmount,
      content: orderReference,
      orderReference,
    });
    try {
      return await this.prisma.vietQrPaymentRequest.create({
        data: {
          storeId: order.storeId,
          orderId: order.id,
          orderReference,
          amount: order.totalAmount,
          content: generated.content,
          qrCode: generated.qrCode,
          qrLink: generated.qrLink,
        },
      });
    } catch (error) {
      if (this.unique(error)) {
        const replay = await this.prisma.vietQrPaymentRequest.findUnique({ where: { orderId } });
        if (replay) return replay;
      }
      throw error;
    }
  }

  async issueVietQrCallbackToken(authorization: string | undefined) {
    const expectedUsername = this.callbackConfig('VIETQR_CALLBACK_USERNAME');
    const expectedPassword = this.callbackConfig('VIETQR_CALLBACK_PASSWORD');
    const [type, encoded] = authorization?.split(' ') ?? [];
    if (type !== 'Basic' || !encoded)
      throw new UnauthorizedException('Invalid VietQR credentials.');
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator < 1) throw new UnauthorizedException('Invalid VietQR credentials.');
    if (
      !this.constantEqual(decoded.slice(0, separator), expectedUsername) ||
      !this.constantEqual(decoded.slice(separator + 1), expectedPassword)
    )
      throw new UnauthorizedException('Invalid VietQR credentials.');
    const accessToken = await this.jwt.signAsync(
      { provider: 'vietqr' },
      { secret: this.callbackConfig('VIETQR_CALLBACK_TOKEN_SECRET'), expiresIn: '5m' },
    );
    return { access_token: accessToken, token_type: 'Bearer', expires_in: 300 };
  }

  async assertVietQrCallbackToken(authorization: string | undefined): Promise<void> {
    const [type, token] = authorization?.split(' ') ?? [];
    if (type !== 'Bearer' || !token) throw new UnauthorizedException('Invalid VietQR token.');
    try {
      const payload = await this.jwt.verifyAsync<{ provider?: string }>(token, {
        secret: this.callbackConfig('VIETQR_CALLBACK_TOKEN_SECRET'),
      });
      if (payload.provider !== 'vietqr') throw new UnauthorizedException('Invalid VietQR token.');
    } catch {
      throw new UnauthorizedException('Invalid VietQR token.');
    }
  }
  async capture(
    actor: AuthenticatedUser,
    key: string | undefined,
    orderId: string,
    dto: CapturePaymentDto,
  ) {
    this.key(key);
    if (dto.method === PaymentMethod.QR_VIETQR)
      throw new BadRequestException('VietQR payments can only be captured by the signed callback.');
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found.');
    this.assertStore(actor, order.storeId);
    const prior = await this.prisma.idempotencyRecord.findUnique({
      where: {
        storeId_scope_key: { storeId: order.storeId, scope: IdempotencyScope.CAPTURE_PAYMENT, key },
      },
    });
    if (prior?.paymentId) return this.payment(actor, prior.paymentId);
    const orderEntity = OrderEntity.rehydrate(order);
    if (!orderEntity.canAcceptPayment())
      throw new ConflictException('Order has already been paid or cancelled.');
    if (!orderEntity.hasTotal(dto.amount))
      throw new BadRequestException('Payment amount must equal the order total.');
    try {
      const paymentResult = await this.prisma.$transaction(async (tx) => {
        await this.shifts.lockStore(tx, order.storeId);
        const replayAfterLock = await tx.idempotencyRecord.findUnique({
          where: {
            storeId_scope_key: {
              storeId: order.storeId,
              scope: IdempotencyScope.CAPTURE_PAYMENT,
              key,
            },
          },
        });
        if (replayAfterLock?.paymentId)
          return tx.payment.findUniqueOrThrow({
            where: { id: replayAfterLock.paymentId },
            include: paymentInclude,
          });
        const shift = await this.shifts.openForPayment(tx, order.storeId, dto.registerId);
        const paid = await tx.order.updateMany({
          where: { id: order.id, status: OrderStatus.AWAITING_PAYMENT },
          data: { status: OrderStatus.PAID },
        });
        if (paid.count !== 1)
          throw new ConflictException('Order has already been paid or cancelled.');
        const payment = await tx.payment.create({
          data: {
            storeId: order.storeId,
            orderId: order.id,
            shiftId: shift.id,
            method: dto.method,
            amount: dto.amount,
            capturedById: actor.id,
          },
          include: paymentInclude,
        });
        if (dto.method === PaymentMethod.CASH)
          await tx.cashMovement.create({
            data: {
              storeId: order.storeId,
              shiftId: shift.id,
              paymentId: payment.id,
              kind: 'CASH_SALE',
              amount: dto.amount,
            },
          });
        await tx.voucherRedemption.updateMany({
          where: { orderId: order.id, status: VoucherRedemptionStatus.RESERVED },
          data: { status: VoucherRedemptionStatus.REDEEMED, redeemedAt: new Date() },
        });
        await this.fulfillment.createForPaidOrder(tx, order.id, actor.id);
        await this.audit.write(tx, {
          storeId: order.storeId,
          actorId: actor.id,
          action: 'PAYMENT_CAPTURED',
          targetType: 'PAYMENT',
          targetId: payment.id,
          metadata: { orderId: order.id, method: dto.method, amount: dto.amount },
        });
        await tx.idempotencyRecord.create({
          data: {
            storeId: order.storeId,
            scope: IdempotencyScope.CAPTURE_PAYMENT,
            key,
            paymentId: payment.id,
          },
        });
        return payment;
      });

      this.events.emit(order.storeId, 'order.paid', {
        orderId: order.id,
        paymentId: paymentResult.id,
        method: paymentResult.method,
        amount: paymentResult.amount,
      });

      return paymentResult;
    } catch (error) {
      if (this.unique(error)) {
        const replay = await this.prisma.idempotencyRecord.findUnique({
          where: {
            storeId_scope_key: {
              storeId: order.storeId,
              scope: IdempotencyScope.CAPTURE_PAYMENT,
              key,
            },
          },
        });
        if (replay?.paymentId) return this.payment(actor, replay.paymentId);
      }
      throw error;
    }
  }
  async refund(
    actor: AuthenticatedUser,
    key: string | undefined,
    paymentId: string,
    dto: RefundPaymentDto,
  ) {
    this.key(key);
    const payment = await this.payment(actor, paymentId);
    const existing = await this.prisma.idempotencyRecord.findUnique({
      where: {
        storeId_scope_key: {
          storeId: payment.storeId,
          scope: IdempotencyScope.REFUND_PAYMENT,
          key,
        },
      },
    });
    if (existing?.paymentId) return this.payment(actor, existing.paymentId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.shifts.lockStore(tx, payment.storeId);
        const replayAfterLock = await tx.idempotencyRecord.findUnique({
          where: {
            storeId_scope_key: {
              storeId: payment.storeId,
              scope: IdempotencyScope.REFUND_PAYMENT,
              key,
            },
          },
        });
        if (replayAfterLock?.paymentId)
          return tx.payment.findUniqueOrThrow({
            where: { id: replayAfterLock.paymentId },
            include: paymentInclude,
          });
        const refunded = await tx.payment.updateMany({
          where: { id: payment.id, status: PaymentStatus.CAPTURED },
          data: {
            status: PaymentStatus.REFUNDED,
            refundedById: actor.id,
            refundedAt: new Date(),
            refundNote: dto.note,
          },
        });
        if (refunded.count !== 1)
          throw new ConflictException('Payment has already been refunded or voided.');
        const order = await tx.order.updateMany({
          where: { id: payment.orderId, status: OrderStatus.PAID },
          data: { status: OrderStatus.REFUNDED },
        });
        if (order.count !== 1) throw new ConflictException('Only a paid order can be refunded.');
        await tx.voucherRedemption.updateMany({
          where: { orderId: payment.orderId, status: VoucherRedemptionStatus.REDEEMED },
          data: {
            status: VoucherRedemptionStatus.RELEASED,
            releasedAt: new Date(),
            releaseReason: 'PAYMENT_REFUND',
          },
        });
        await this.fulfillment.voidForRefund(tx, payment.orderId, actor.id, dto.note);
        if (payment.method === PaymentMethod.CASH) {
          const shift = await this.shifts.openForPayment(tx, payment.storeId);
          await tx.cashMovement.create({
            data: {
              storeId: payment.storeId,
              shiftId: shift.id,
              paymentId: payment.id,
              kind: 'REFUND',
              amount: -payment.amount,
              note: dto.note,
            },
          });
        }
        await this.audit.write(tx, {
          storeId: payment.storeId,
          actorId: actor.id,
          action: 'PAYMENT_REFUNDED',
          targetType: 'PAYMENT',
          targetId: payment.id,
          metadata: { orderId: payment.orderId, method: payment.method, amount: payment.amount },
        });
        await tx.idempotencyRecord.create({
          data: {
            storeId: payment.storeId,
            scope: IdempotencyScope.REFUND_PAYMENT,
            key,
            paymentId: payment.id,
          },
        });
        return tx.payment.findUniqueOrThrow({ where: { id: payment.id }, include: paymentInclude });
      });
    } catch (error) {
      if (this.unique(error)) {
        const replay = await this.prisma.idempotencyRecord.findUnique({
          where: {
            storeId_scope_key: {
              storeId: payment.storeId,
              scope: IdempotencyScope.REFUND_PAYMENT,
              key,
            },
          },
        });
        if (replay?.paymentId) return this.payment(actor, replay.paymentId);
      }
      throw error;
    }
  }

  /** Records an authenticated VietQR bank-credit notification idempotently. */
  async captureVietQr(dto: VietQrTransactionSyncDto): Promise<{ processed: boolean }> {
    if (dto.transType !== 'C') return { processed: false };
    const request = await this.prisma.vietQrPaymentRequest.findUnique({
      where: { orderReference: dto.orderId },
    });
    if (!request) throw new NotFoundException('VietQR payment request not found.');
    if (dto.bankaccount !== this.callbackConfig('VIETQR_BANK_ACCOUNT'))
      throw new BadRequestException('Transaction bank account does not match this merchant.');
    if (
      dto.content !== request.content &&
      !dto.content.includes(request.content) &&
      !dto.content.includes(request.orderReference)
    )
      throw new BadRequestException('Transaction content does not match the payment request.');
    const order = await this.prisma.order.findUnique({ where: { id: request.orderId } });
    if (!order) throw new NotFoundException('Order not found.');
    const prior = await this.prisma.payment.findUnique({
      where: { providerTransactionId: dto.transactionid },
    });
    if (prior) {
      if (
        prior.orderId !== order.id ||
        prior.amount !== dto.amount ||
        prior.method !== PaymentMethod.QR_VIETQR
      ) {
        throw new ConflictException('Transaction reference was already used for another payment.');
      }
      return { processed: true };
    }
    const orderEntity = OrderEntity.rehydrate(order);
    if (!orderEntity.canAcceptPayment())
      throw new ConflictException('Order has already been paid or cancelled.');
    if (!orderEntity.hasTotal(dto.amount) || request.amount !== dto.amount)
      throw new BadRequestException('Transaction amount does not match the order total.');

    try {
      await this.prisma.$transaction(async (tx) => {
        await this.shifts.lockStore(tx, order.storeId);
        const replayAfterLock = await tx.payment.findUnique({
          where: { providerTransactionId: dto.transactionid },
        });
        if (replayAfterLock) {
          if (
            replayAfterLock.orderId !== order.id ||
            replayAfterLock.amount !== dto.amount ||
            replayAfterLock.method !== PaymentMethod.QR_VIETQR
          ) {
            throw new ConflictException(
              'Transaction reference was already used for another payment.',
            );
          }
          return;
        }

        const shift = await this.shifts.openForPayment(tx, order.storeId);
        const paid = await tx.order.updateMany({
          where: { id: order.id, status: OrderStatus.AWAITING_PAYMENT },
          data: { status: OrderStatus.PAID },
        });
        if (paid.count !== 1)
          throw new ConflictException('Order has already been paid or cancelled.');
        const payment = await tx.payment.create({
          data: {
            storeId: order.storeId,
            orderId: order.id,
            shiftId: shift.id,
            method: PaymentMethod.QR_VIETQR,
            amount: dto.amount,
            // A provider callback has no staff JWT. The order creator is the
            // cashier accountable for its checkout; provider ID retains the
            // external payment audit trail.
            capturedById: order.createdById,
            providerTransactionId: dto.transactionid,
          },
        });
        await tx.voucherRedemption.updateMany({
          where: { orderId: order.id, status: VoucherRedemptionStatus.RESERVED },
          data: { status: VoucherRedemptionStatus.REDEEMED, redeemedAt: new Date() },
        });
        await this.fulfillment.createForPaidOrder(tx, order.id, order.createdById);
        await this.audit.write(tx, {
          storeId: order.storeId,
          actorId: order.createdById,
          action: 'VIETQR_PAYMENT_CAPTURED',
          targetType: 'PAYMENT',
          targetId: payment.id,
          metadata: { orderId: order.id, amount: dto.amount, transactionId: dto.transactionid },
        });
      });

      this.events.emit(order.storeId, 'order.paid', {
        orderId: order.id,
        method: PaymentMethod.QR_VIETQR,
        amount: dto.amount,
        transactionId: dto.transactionid,
      });

      return { processed: true };
    } catch (error) {
      if (this.unique(error)) {
        const replay = await this.prisma.payment.findUnique({
          where: { providerTransactionId: dto.transactionid },
        });
        if (
          replay?.orderId === order.id &&
          replay.amount === dto.amount &&
          replay.method === PaymentMethod.QR_VIETQR
        )
          return { processed: true };
      }
      throw error;
    }
  }

  private async payment(actor: AuthenticatedUser, paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: paymentInclude,
    });
    if (!payment) throw new NotFoundException('Payment not found.');
    this.assertStore(actor, payment.storeId);
    return payment;
  }
  private key(key: string | undefined): asserts key is string {
    if (!key?.trim() || key.length > 200)
      throw new BadRequestException('Idempotency-Key header is required.');
  }
  private assertStore(actor: AuthenticatedUser, storeId: string) {
    if (!actor.isPlatformAdmin && !actor.storeIds.includes(storeId))
      throw new ForbiddenException('Store access denied.');
  }
  private unique(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
  private callbackConfig(key: string): string {
    const value = this.config.get<string>(key)?.trim();
    if (!value)
      throw new ServiceUnavailableException(`VietQR callback is not configured (${key}).`);
    return value;
  }
  private constantEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }
}
