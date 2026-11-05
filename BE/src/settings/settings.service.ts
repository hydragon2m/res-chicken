import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../identity/types/authenticated-user.js';
import type { UpdateStoreSettingsDto } from './dto/update-store-settings.dto.js';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getStoreSettings(actor: AuthenticatedUser, storeId: string) {
    this.assertStore(actor, storeId);
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: {
        id: true,
        name: true,
        timezone: true,
        phone: true,
        address: true,
        taxRate: true,
        taxCode: true,
        receiptHeader: true,
        receiptFooter: true,
        openingTime: true,
        closingTime: true,
        inventoryPolicy: true,
      },
    });
    if (!store) throw new NotFoundException('Store not found.');
    return store;
  }

  async updateStoreSettings(
    actor: AuthenticatedUser,
    storeId: string,
    dto: UpdateStoreSettingsDto,
  ) {
    this.assertStore(actor, storeId);
    const updated = await this.prisma.store.update({
      where: { id: storeId },
      data: {
        phone: dto.phone?.trim(),
        address: dto.address?.trim(),
        taxRate: dto.taxRate,
        taxCode: dto.taxCode?.trim(),
        receiptHeader: dto.receiptHeader?.trim(),
        receiptFooter: dto.receiptFooter?.trim(),
        openingTime: dto.openingTime?.trim(),
        closingTime: dto.closingTime?.trim(),
        inventoryPolicy: dto.inventoryPolicy,
      },
      select: {
        id: true,
        name: true,
        timezone: true,
        phone: true,
        address: true,
        taxRate: true,
        taxCode: true,
        receiptHeader: true,
        receiptFooter: true,
        openingTime: true,
        closingTime: true,
        inventoryPolicy: true,
      },
    });

    await this.audit.write(this.prisma, {
      storeId,
      actorId: actor.id,
      action: 'STORE_SETTINGS_UPDATED',
      targetType: 'STORE_SETTINGS',
      targetId: storeId,
      metadata: {
        taxRate: dto.taxRate,
        taxCode: dto.taxCode,
        receiptHeader: dto.receiptHeader,
        receiptFooter: dto.receiptFooter,
      },
    });

    return updated;
  }

  async getPublicStoreInfo(storeId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: {
        id: true,
        name: true,
        phone: true,
        address: true,
        openingTime: true,
        closingTime: true,
      },
    });
    if (!store) throw new NotFoundException('Store not found.');
    return store;
  }

  private assertStore(actor: AuthenticatedUser, storeId: string) {
    if (!actor.isPlatformAdmin && !actor.storeIds.includes(storeId)) {
      throw new ForbiddenException('Store access denied.');
    }
  }
}
