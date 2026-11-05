import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IdempotencyScope, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ShiftEntity } from '../domain/entities/shift.entity.js';
import type { AuthenticatedUser } from '../identity/types/authenticated-user.js';
import type { CloseShiftDto } from './dto/close-shift.dto.js';
import type { CreateCashAdjustmentDto } from './dto/create-cash-adjustment.dto.js';
import type { OpenShiftDto } from './dto/open-shift.dto.js';

type DbClient = Prisma.TransactionClient | PrismaService;
const shiftInclude = {
  cashMovements: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.ShiftInclude;

@Injectable()
export class ShiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}
  async current(actor: AuthenticatedUser, storeId: string, registerId?: string) {
    this.assertStore(actor, storeId);
    return this.prisma.shift.findFirst({
      where: { storeId, registerId, status: 'OPEN' },
      include: shiftInclude,
      orderBy: { openedAt: 'desc' },
    });
  }
  async open(actor: AuthenticatedUser, key: string | undefined, dto: OpenShiftDto) {
    this.assertStore(actor, dto.storeId);
    this.key(key);
    const replay = await this.prisma.idempotencyRecord.findUnique({
      where: {
        storeId_scope_key: {
          storeId: dto.storeId,
          scope: IdempotencyScope.OPEN_SHIFT,
          key,
        },
      },
    });
    if (replay?.shiftId) return this.byId(actor, replay.shiftId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockStore(tx, dto.storeId);
        const replayAfterLock = await tx.idempotencyRecord.findUnique({
          where: {
            storeId_scope_key: {
              storeId: dto.storeId,
              scope: IdempotencyScope.OPEN_SHIFT,
              key,
            },
          },
        });
        if (replayAfterLock?.shiftId)
          return tx.shift.findUniqueOrThrow({
            where: { id: replayAfterLock.shiftId },
            include: shiftInclude,
          });
        const register = await this.registerForShift(tx, dto.storeId, dto.registerId);
        const openShift = await tx.shift.findFirst({
          where: { registerId: register.id, status: 'OPEN' },
        });
        if (openShift) throw new ConflictException('A shift is already open for this register.');
        const shift = await tx.shift.create({
          data: {
            storeId: dto.storeId,
            registerId: register.id,
            openedById: actor.id,
            openingCash: dto.openingCash,
            cashMovements: {
              create: {
                storeId: dto.storeId,
                kind: 'OPENING_FLOAT',
                amount: dto.openingCash,
              },
            },
          },
          include: shiftInclude,
        });
        await tx.idempotencyRecord.create({
          data: {
            storeId: dto.storeId,
            scope: IdempotencyScope.OPEN_SHIFT,
            key,
            shiftId: shift.id,
          },
        });
        await this.audit.write(tx, {
          storeId: dto.storeId,
          actorId: actor.id,
          action: 'SHIFT_OPENED',
          targetType: 'SHIFT',
          targetId: shift.id,
          metadata: { openingCash: dto.openingCash, registerId: register.id },
        });
        return shift;
      });
    } catch (error) {
      if (this.unique(error)) {
        const record = await this.prisma.idempotencyRecord.findUnique({
          where: {
            storeId_scope_key: {
              storeId: dto.storeId,
              scope: IdempotencyScope.OPEN_SHIFT,
              key,
            },
          },
        });
        if (record?.shiftId) return this.byId(actor, record.shiftId);
        throw new ConflictException('A shift is already open for this register.');
      }
      throw error;
    }
  }
  async close(
    actor: AuthenticatedUser,
    key: string | undefined,
    shiftId: string,
    dto: CloseShiftDto,
  ) {
    this.key(key);
    const shift = await this.byId(actor, shiftId);
    this.assertShiftOperator(actor, shift.openedById);
    const replay = await this.prisma.idempotencyRecord.findUnique({
      where: {
        storeId_scope_key: {
          storeId: shift.storeId,
          scope: IdempotencyScope.CLOSE_SHIFT,
          key,
        },
      },
    });
    if (replay?.shiftId) return this.byId(actor, replay.shiftId);
    if (shift.status !== 'OPEN') throw new ConflictException('Shift is already closed.');
    return this.prisma.$transaction(async (tx) => {
      await this.lockStore(tx, shift.storeId);
      const replayAfterLock = await tx.idempotencyRecord.findUnique({
        where: {
          storeId_scope_key: {
            storeId: shift.storeId,
            scope: IdempotencyScope.CLOSE_SHIFT,
            key,
          },
        },
      });
      if (replayAfterLock?.shiftId)
        return tx.shift.findUniqueOrThrow({
          where: { id: replayAfterLock.shiftId },
          include: shiftInclude,
        });
      const openShift = await tx.shift.findFirst({
        where: { id: shiftId, status: 'OPEN' },
      });
      if (!openShift) throw new ConflictException('Shift is already closed.');
      const movements = await tx.cashMovement.aggregate({
        where: { shiftId },
        _sum: { amount: true },
      });
      const expectedCash = movements._sum.amount ?? 0;
      const settlement = ShiftEntity.rehydrate(openShift).close(dto.declaredCash, expectedCash);
      const closed = await tx.shift.updateMany({
        where: { id: shiftId, status: 'OPEN' },
        data: {
          status: 'CLOSED',
          closedById: actor.id,
          closedAt: new Date(),
          declaredCash: settlement.declaredCash,
          expectedCash: settlement.expectedCash,
          variance: settlement.variance,
        },
      });
      if (closed.count !== 1) throw new ConflictException('Shift is already closed.');
      await tx.idempotencyRecord.create({
        data: {
          storeId: shift.storeId,
          scope: IdempotencyScope.CLOSE_SHIFT,
          key,
          shiftId,
        },
      });
      await this.audit.write(tx, {
        storeId: shift.storeId,
        actorId: actor.id,
        action: 'SHIFT_CLOSED',
        targetType: 'SHIFT',
        targetId: shiftId,
        metadata: {
          declaredCash: settlement.declaredCash,
          expectedCash: settlement.expectedCash,
          variance: settlement.variance,
        },
      });
      return tx.shift.findUniqueOrThrow({
        where: { id: shiftId },
        include: shiftInclude,
      });
    });
  }
  async adjustment(
    actor: AuthenticatedUser,
    key: string | undefined,
    shiftId: string,
    dto: CreateCashAdjustmentDto,
  ) {
    this.key(key);
    const shift = await this.byId(actor, shiftId);
    this.assertShiftOperator(actor, shift.openedById);
    const replay = await this.prisma.idempotencyRecord.findUnique({
      where: {
        storeId_scope_key: {
          storeId: shift.storeId,
          scope: IdempotencyScope.CASH_ADJUSTMENT,
          key,
        },
      },
    });
    if (replay?.shiftId) return this.byId(actor, replay.shiftId);
    if (shift.status !== 'OPEN')
      throw new ConflictException('Cash can only be adjusted while a shift is open.');
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockStore(tx, shift.storeId);
        const stillOpen = await tx.shift.findFirst({
          where: { id: shiftId, status: 'OPEN' },
        });
        if (!stillOpen) throw new ConflictException('Shift is already closed.');
        await tx.cashMovement.create({
          data: {
            storeId: shift.storeId,
            shiftId,
            kind: 'ADJUSTMENT',
            amount: dto.amount,
            note: dto.note,
          },
        });
        await tx.idempotencyRecord.create({
          data: {
            storeId: shift.storeId,
            scope: IdempotencyScope.CASH_ADJUSTMENT,
            key,
            shiftId,
          },
        });
        await this.audit.write(tx, {
          storeId: shift.storeId,
          actorId: actor.id,
          action: 'CASH_ADJUSTMENT_CREATED',
          targetType: 'SHIFT',
          targetId: shiftId,
          metadata: { amount: dto.amount, note: dto.note },
        });
        return tx.shift.findUniqueOrThrow({
          where: { id: shiftId },
          include: shiftInclude,
        });
      });
    } catch (error) {
      if (this.unique(error)) {
        const record = await this.prisma.idempotencyRecord.findUnique({
          where: {
            storeId_scope_key: {
              storeId: shift.storeId,
              scope: IdempotencyScope.CASH_ADJUSTMENT,
              key,
            },
          },
        });
        if (record?.shiftId) return this.byId(actor, record.shiftId);
      }
      throw error;
    }
  }
  async openForPayment(tx: DbClient, storeId: string, registerId?: string) {
    await this.lockStore(tx, storeId);
    if (registerId) {
      const shift = await tx.shift.findFirst({
        where: { storeId, registerId, status: 'OPEN' },
        orderBy: { openedAt: 'desc' },
      });
      if (!shift) throw new ConflictException('Open the selected register before taking payment.');
      return shift;
    }
    const shifts = await tx.shift.findMany({
      where: { storeId, status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
    });
    if (shifts.length === 0) throw new ConflictException('Open a shift before taking payment.');
    if (shifts.length > 1)
      throw new ConflictException('Choose the cash register before taking payment.');
    return shifts[0];
  }
  async byId(actor: AuthenticatedUser, id: string) {
    const shift = await this.prisma.shift.findUnique({
      where: { id },
      include: shiftInclude,
    });
    if (!shift) throw new NotFoundException('Shift not found.');
    this.assertStore(actor, shift.storeId);
    return shift;
  }
  private key(key: string | undefined): asserts key is string {
    if (!key?.trim() || key.length > 200)
      throw new BadRequestException('Idempotency-Key header is required.');
  }
  private assertStore(actor: AuthenticatedUser, storeId: string) {
    if (!actor.isPlatformAdmin && !actor.storeIds.includes(storeId))
      throw new ForbiddenException('Store access denied.');
  }
  private assertShiftOperator(actor: AuthenticatedUser, openedById: string) {
    const canOverride = actor.role === 'ADMIN' || actor.role === 'MANAGER';
    if (actor.id !== openedById && !canOverride)
      throw new ForbiddenException(
        'Only the cashier who opened this shift may perform this action.',
      );
  }
  private async registerForShift(tx: DbClient, storeId: string, registerId?: string) {
    if (registerId) {
      const register = await tx.cashRegister.findFirst({
        where: { id: registerId, storeId, isActive: true },
      });
      if (!register)
        throw new NotFoundException('An active cash register is required to open a shift.');
      return register;
    }
    const existing = await tx.cashRegister.findFirst({
      where: { storeId, code: 'MAIN' },
    });
    if (existing) {
      if (!existing.isActive)
        throw new NotFoundException('An active cash register is required to open a shift.');
      return existing;
    }
    return tx.cashRegister.create({
      data: {
        storeId,
        code: 'MAIN',
        name: 'Main Register',
        isActive: true,
      },
    });
  }
  private unique(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
  async lockStore(tx: DbClient, storeId: string) {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${storeId}))`);
  }
}
