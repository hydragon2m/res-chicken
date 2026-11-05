import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service.js';
import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../identity/types/authenticated-user.js';
import type { ListAuditLogsDto } from './dto/list-audit-logs.dto.js';

type DbClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  write(
    tx: DbClient,
    entry: {
      storeId?: string;
      actorId?: string;
      action: string;
      targetType: string;
      targetId?: string;
      metadata?: Prisma.InputJsonValue;
    },
  ) {
    return tx.auditLog.create({ data: entry });
  }

  async list(actor: AuthenticatedUser, query: ListAuditLogsDto) {
    if (!actor.isPlatformAdmin && !actor.storeIds.includes(query.storeId))
      throw new ForbiddenException('Store access denied.');
    return this.prisma.auditLog.findMany({
      where: {
        storeId: query.storeId,
        actorId: query.actorId,
        action: query.action,
        targetType: query.targetType,
        createdAt: query.before ? { lt: new Date(query.before) } : undefined,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.take,
    });
  }
}
