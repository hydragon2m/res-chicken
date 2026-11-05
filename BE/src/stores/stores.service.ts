import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UserRole } from '@prisma/client';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../database/prisma.service.js';
import type { AuthenticatedUser } from '../identity/types/authenticated-user.js';
import type { CreateCashRegisterDto, CreateStoreDto } from './dto/create-store.dto.js';

@Injectable()
export class StoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(actor: AuthenticatedUser) {
    this.assertPlatform(actor);
    return this.prisma.store.findMany({
      include: { cashRegisters: { orderBy: { code: 'asc' } } },
      orderBy: { name: 'asc' },
    });
  }

  async listPublic() {
    return this.prisma.store.findMany({
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
        openingTime: true,
        closingTime: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async create(actor: AuthenticatedUser, dto: CreateStoreDto) {
    this.assertPlatform(actor);
    const owner = await this.prisma.user.findUnique({
      where: { id: dto.ownerUserId },
      select: { id: true, isActive: true, role: true },
    });
    if (!owner || !owner.isActive) throw new NotFoundException('Store owner is not active.');
    if (owner.role !== UserRole.ADMIN)
      throw new ConflictException('Store owner must have the ADMIN store role.');

    try {
      return await this.prisma.$transaction(async (tx) => {
        const store = await tx.store.create({
          data: {
            name: dto.name.trim(),
            timezone: dto.timezone?.trim() || 'Asia/Ho_Chi_Minh',
          },
        });
        await tx.storeMember.upsert({
          where: { userId_storeId: { userId: owner.id, storeId: store.id } },
          create: { userId: owner.id, storeId: store.id },
          update: {},
        });
        await tx.cashRegister.create({
          data: { storeId: store.id, code: 'MAIN', name: 'Quầy chính' },
        });
        await tx.inventoryLocation.create({
          data: { storeId: store.id, name: 'Khu sơ chế', kind: 'PREP' },
        });
        await this.audit.write(tx, {
          storeId: store.id,
          actorId: actor.id,
          action: 'STORE_CREATED',
          targetType: 'STORE',
          targetId: store.id,
          metadata: { name: store.name, ownerUserId: owner.id },
        });
        return store;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('A store/register with this identifier already exists.');
      throw error;
    }
  }

  async listRegisters(actor: AuthenticatedUser, storeId: string) {
    this.assertStore(actor, storeId);
    return this.prisma.cashRegister.findMany({
      where: { storeId, isActive: true },
      orderBy: { code: 'asc' },
    });
  }

  async createRegister(actor: AuthenticatedUser, dto: CreateCashRegisterDto) {
    this.assertStore(actor, dto.storeId);
    try {
      const register = await this.prisma.cashRegister.create({
        data: {
          storeId: dto.storeId,
          name: dto.name.trim(),
          code: dto.code.trim().toUpperCase(),
        },
      });
      await this.audit.write(this.prisma, {
        storeId: dto.storeId,
        actorId: actor.id,
        action: 'CASH_REGISTER_CREATED',
        targetType: 'CASH_REGISTER',
        targetId: register.id,
        metadata: { name: register.name, code: register.code },
      });
      return register;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('Register code already exists for this store.');
      throw error;
    }
  }

  private assertPlatform(actor: AuthenticatedUser) {
    if (!actor.isPlatformAdmin)
      throw new ForbiddenException('Platform administrator access is required.');
  }

  private assertStore(actor: AuthenticatedUser, storeId: string) {
    if (!actor.isPlatformAdmin && !actor.storeIds.includes(storeId))
      throw new ForbiddenException('Store access denied.');
  }
}
