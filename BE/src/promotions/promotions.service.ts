import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CampaignStatus, DiscountType, Prisma, VoucherRedemptionStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../identity/types/authenticated-user.js';
import type { CreateCampaignDto } from './dto/create-campaign.dto.js';
import type { GenerateVouchersDto } from './dto/generate-vouchers.dto.js';
import type { UpdateCampaignDto } from './dto/update-campaign.dto.js';
import type { ValidateVoucherDto } from './dto/validate-voucher.dto.js';
import crypto from 'node:crypto';

@Injectable()
export class PromotionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(actor: AuthenticatedUser, storeId: string) {
    this.assertStore(actor, storeId);
    return this.prisma.campaign.findMany({
      where: { storeId },
      include: {
        vouchers: {
          include: {
            _count: {
              select: { redemptions: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            vouchers: true,
            redemptions: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(actor: AuthenticatedUser, id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: {
        vouchers: {
          include: {
            _count: {
              select: { redemptions: true },
            },
          },
        },
        _count: {
          select: { redemptions: true },
        },
      },
    });
    if (!campaign) throw new NotFoundException('Campaign not found.');
    this.assertStore(actor, campaign.storeId);
    return campaign;
  }

  async create(actor: AuthenticatedUser, dto: CreateCampaignDto) {
    this.assertStore(actor, dto.storeId);
    this.assertCampaignSchedule(dto.startsAt, dto.endsAt);
    this.assertDiscount(dto.discountType, dto.discountValue);
    const campaign = await this.prisma.campaign.create({
      data: {
        storeId: dto.storeId,
        name: dto.name,
        discountType: dto.discountType,
        discountValue: dto.discountValue,
        minOrderAmount: dto.minOrderAmount ?? 0,
        maxDiscountAmount: dto.maxDiscountAmount,
        redemptionQuota: dto.redemptionQuota,
        startsAt: new Date(dto.startsAt),
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      },
    });

    await this.audit.write(this.prisma, {
      storeId: dto.storeId,
      actorId: actor.id,
      action: 'CAMPAIGN_CREATED',
      targetType: 'CAMPAIGN',
      targetId: campaign.id,
      metadata: {
        name: campaign.name,
        discountType: campaign.discountType,
        discountValue: campaign.discountValue,
      },
    });

    return campaign;
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateCampaignDto) {
    const existing = await this.prisma.campaign.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Campaign not found.');
    this.assertStore(actor, existing.storeId);
    this.assertCampaignSchedule(
      dto.startsAt ?? existing.startsAt.toISOString(),
      dto.endsAt !== undefined ? dto.endsAt : (existing.endsAt?.toISOString() ?? null),
    );
    this.assertDiscount(
      dto.discountType ?? existing.discountType,
      dto.discountValue ?? existing.discountValue,
    );

    const updated = await this.prisma.campaign.update({
      where: { id },
      data: {
        name: dto.name,
        status: dto.status,
        discountType: dto.discountType,
        discountValue: dto.discountValue,
        minOrderAmount: dto.minOrderAmount,
        maxDiscountAmount: dto.maxDiscountAmount,
        redemptionQuota: dto.redemptionQuota,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt !== undefined ? (dto.endsAt ? new Date(dto.endsAt) : null) : undefined,
      },
    });

    await this.audit.write(this.prisma, {
      storeId: existing.storeId,
      actorId: actor.id,
      action: 'CAMPAIGN_UPDATED',
      targetType: 'CAMPAIGN',
      targetId: updated.id,
      metadata: { status: dto.status, name: dto.name },
    });

    return updated;
  }

  async setStatus(actor: AuthenticatedUser, id: string, status: CampaignStatus) {
    const existing = await this.prisma.campaign.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Campaign not found.');
    this.assertStore(actor, existing.storeId);

    const updated = await this.prisma.campaign.update({
      where: { id },
      data: { status },
    });

    await this.audit.write(this.prisma, {
      storeId: existing.storeId,
      actorId: actor.id,
      action: 'CAMPAIGN_STATUS_CHANGED',
      targetType: 'CAMPAIGN',
      targetId: updated.id,
      metadata: { status },
    });

    return updated;
  }

  async generateVouchers(actor: AuthenticatedUser, campaignId: string, dto: GenerateVouchersDto) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new NotFoundException('Campaign not found.');
    this.assertStore(actor, campaign.storeId);

    const codes =
      dto.customCodes && dto.customCodes.length > 0
        ? dto.customCodes
        : Array.from({ length: dto.quantity ?? 1 }, () => this.generateRandomCode());

    const normalizedCodes = codes.map((code) => code.trim().toUpperCase());
    if (new Set(normalizedCodes).size !== normalizedCodes.length)
      throw new BadRequestException('Voucher codes must be unique in a batch.');
    const existing = await this.prisma.voucher.findMany({
      where: { code: { in: normalizedCodes } },
      select: { code: true },
    });
    if (existing.length)
      throw new ConflictException(
        `Voucher code already exists: ${existing.map((item) => item.code).join(', ')}.`,
      );
    const created = await this.prisma.voucher.createManyAndReturn({
      data: normalizedCodes.map((code) => ({
        campaignId,
        code,
        redemptionQuota: dto.redemptionQuota,
        isActive: true,
      })),
    });

    await this.audit.write(this.prisma, {
      storeId: campaign.storeId,
      actorId: actor.id,
      action: 'VOUCHERS_GENERATED',
      targetType: 'CAMPAIGN',
      targetId: campaign.id,
      metadata: { count: created.length },
    });

    return created;
  }

  async listVouchers(actor: AuthenticatedUser, campaignId: string) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new NotFoundException('Campaign not found.');
    this.assertStore(actor, campaign.storeId);

    return this.prisma.voucher.findMany({
      where: { campaignId },
      include: {
        _count: {
          select: { redemptions: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Public: List active campaigns and public vouchers for a store
   */
  async listPublic(storeId?: string) {
    const now = new Date();
    return this.prisma.campaign.findMany({
      where: {
        ...(storeId ? { storeId } : {}),
        status: CampaignStatus.PUBLISHED,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gte: now } }],
      },
      include: {
        vouchers: {
          where: { isActive: true },
          take: 5,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Validate voucher for a given subtotal amount
   */
  async validateVoucher(
    dto: ValidateVoucherDto,
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    const now = new Date();
    const voucher = await client.voucher.findUnique({
      where: { code: dto.code.trim().toUpperCase() },
      include: {
        campaign: true,
        redemptions: {
          where: {
            status: { in: [VoucherRedemptionStatus.RESERVED, VoucherRedemptionStatus.REDEEMED] },
          },
        },
      },
    });

    if (!voucher || !voucher.isActive) {
      throw new BadRequestException('Mã voucher không tồn tại hoặc đã ngừng áp dụng.');
    }
    const campaign = voucher.campaign;
    if (campaign.storeId !== dto.storeId) {
      throw new BadRequestException('Voucher không thuộc chi nhánh này.');
    }
    if (campaign.status !== CampaignStatus.PUBLISHED) {
      throw new BadRequestException('Chương trình ưu đãi chưa được kích hoạt.');
    }
    if (campaign.startsAt > now) {
      throw new BadRequestException('Chương trình ưu đãi chưa đến thời gian áp dụng.');
    }
    if (campaign.endsAt && campaign.endsAt < now) {
      throw new BadRequestException('Chương trình ưu đãi đã hết hạn.');
    }
    if (dto.subtotalAmount < campaign.minOrderAmount) {
      throw new BadRequestException(
        `Đơn hàng cần tối thiểu ${campaign.minOrderAmount.toLocaleString('vi-VN')} đ để áp dụng voucher này.`,
      );
    }

    // Check voucher quota
    if (voucher.redemptionQuota && voucher.redemptions.length >= voucher.redemptionQuota) {
      throw new BadRequestException('Mã voucher này đã hết lượt sử dụng.');
    }

    // Check campaign quota
    if (campaign.redemptionQuota) {
      const totalCampaignRedemptions = await client.voucherRedemption.count({
        where: {
          campaignId: campaign.id,
          status: { in: [VoucherRedemptionStatus.RESERVED, VoucherRedemptionStatus.REDEEMED] },
        },
      });
      if (totalCampaignRedemptions >= campaign.redemptionQuota) {
        throw new BadRequestException('Chương trình ưu đãi đã hết lượt áp dụng.');
      }
    }

    // Calculate discount amount
    let discountAmount = 0;
    if (campaign.discountType === DiscountType.PERCENTAGE) {
      discountAmount = Math.round((dto.subtotalAmount * campaign.discountValue) / 100);
      if (campaign.maxDiscountAmount && discountAmount > campaign.maxDiscountAmount) {
        discountAmount = campaign.maxDiscountAmount;
      }
    } else {
      discountAmount = Math.min(campaign.discountValue, dto.subtotalAmount);
    }

    return {
      valid: true,
      voucherId: voucher.id,
      campaignId: campaign.id,
      campaignName: campaign.name,
      code: voucher.code,
      discountType: campaign.discountType,
      discountValue: campaign.discountValue,
      discountAmount,
      finalAmount: Math.max(0, dto.subtotalAmount - discountAmount),
    };
  }

  async validateAndLockVoucher(tx: Prisma.TransactionClient, dto: ValidateVoucherDto) {
    const code = dto.code.trim().toUpperCase();
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`voucher:${code}`}))`);
    return this.validateVoucher({ ...dto, code }, tx);
  }

  private generateRandomCode(): string {
    return 'CHICK-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  }

  private assertStore(actor: AuthenticatedUser, storeId: string) {
    if (!actor.isPlatformAdmin && !actor.storeIds.includes(storeId)) {
      throw new ForbiddenException('Store access denied.');
    }
  }

  private assertCampaignSchedule(startsAt: string, endsAt?: string | null) {
    const start = new Date(startsAt);
    const end = endsAt ? new Date(endsAt) : null;
    if (Number.isNaN(start.getTime()) || (end && Number.isNaN(end.getTime())))
      throw new BadRequestException('Campaign dates are invalid.');
    if (end && end <= start)
      throw new BadRequestException('Campaign end time must be after start time.');
  }

  private assertDiscount(type: DiscountType, value: number) {
    if (type === DiscountType.PERCENTAGE && value > 100)
      throw new BadRequestException('Percentage discount cannot exceed 100%.');
  }
}
