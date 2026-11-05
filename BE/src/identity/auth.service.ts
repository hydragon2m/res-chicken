import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { UserEntity } from '../domain/entities/identity.entity.js';
import type { CreateUserDto } from './dto/create-user.dto.js';
import type { UpdateUserDto } from './dto/update-user.dto.js';
import type { AuthenticatedUser } from './types/authenticated-user.js';

interface JwtPayload {
  sub: string;
  sid: string;
  authVersion: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly audit: AuditService,
  ) {}

  async login(
    email: string,
    password: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    user: AuthenticatedUser;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: this.actorIncludes,
    });
    if (
      !user ||
      !UserEntity.rehydrate(user).canAuthenticate() ||
      !(await argon2.verify(user.passwordHash, password))
    ) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const result = await this.createSession(user);
    await this.audit.write(this.prisma, {
      actorId: user.id,
      action: 'AUTH_LOGIN_SUCCEEDED',
      targetType: 'USER',
      targetId: user.id,
      metadata: { sessionId: result.user.sessionId },
    });
    return result;
  }

  async getAuthenticatedUser(payload: JwtPayload): Promise<AuthenticatedUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: this.actorIncludes,
    });
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
    });
    if (
      !user ||
      !session ||
      session.userId !== user.id ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !UserEntity.rehydrate(user).canAuthenticate() ||
      !UserEntity.rehydrate(user).hasAuthVersion(payload.authVersion)
    ) {
      return null;
    }
    return this.toAuthenticatedUser(user, payload.sid);
  }

  async refresh(refreshToken: string) {
    const [selector, secret] = refreshToken.split('.', 2);
    if (!selector || !secret) throw new UnauthorizedException();
    const session = await this.prisma.session.findUnique({
      where: { refreshSelector: selector },
      include: { user: { include: this.actorIncludes } },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !(await argon2.verify(session.refreshHash, secret))
    )
      throw new UnauthorizedException();
    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    return this.createSession(session.user);
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const session = await tx.session.findUnique({ where: { id: sessionId } });
      if (!session || session.revokedAt) return;
      await tx.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
      await this.audit.write(tx, {
        actorId: session.userId,
        action: 'AUTH_LOGOUT',
        targetType: 'SESSION',
        targetId: session.id,
        metadata: { userId: session.userId },
      });
    });
  }

  async listAccessibleStores(actor: AuthenticatedUser) {
    return this.prisma.store.findMany({
      where: actor.isPlatformAdmin ? {} : { id: { in: actor.storeIds } },
      select: { id: true, name: true, timezone: true },
      orderBy: { name: 'asc' },
    });
  }

  async listUsers(actor: AuthenticatedUser) {
    return this.prisma.user.findMany({
      where: actor.isPlatformAdmin
        ? {}
        : { memberships: { some: { storeId: { in: actor.storeIds } } } },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        authVersion: true,
        memberships: { select: { storeId: true } },
      },
      orderBy: { email: 'asc' },
    });
  }

  async createUser(actor: AuthenticatedUser, dto: CreateUserDto) {
    const email = dto.email.trim().toLowerCase();
    this.assertStoreMembership(dto.storeIds);
    this.assertStoreScope(actor, dto.storeIds);
    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) throw new ConflictException('A user with this email already exists.');
    await this.assertStoresExist(dto.storeIds);
    const role = await this.prisma.role.findUnique({
      where: { key: dto.role },
      select: { id: true },
    });
    if (!role) throw new NotFoundException('Role is not configured. Run the identity seed first.');
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          passwordHash: await argon2.hash(dto.password),
          role: dto.role,
          memberships: {
            createMany: { data: dto.storeIds.map((storeId) => ({ storeId })) },
          },
          roleLinks: { create: { roleId: role.id } },
        },
        select: {
          id: true,
          email: true,
          role: true,
          isActive: true,
          memberships: { select: { storeId: true } },
        },
      });
      await this.audit.write(tx, {
        actorId: actor.id,
        action: 'USER_CREATED',
        targetType: 'USER',
        targetId: created.id,
        metadata: {
          after: {
            email: created.email,
            role: created.role,
            isActive: created.isActive,
            storeIds: created.memberships.map((membership) => membership.storeId),
          },
        },
      });
      return created;
    });
  }

  async updateUser(actor: AuthenticatedUser, id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, isActive: true, memberships: { select: { storeId: true } } },
    });
    if (!user) throw new NotFoundException('User not found.');
    this.assertStoreScope(
      actor,
      user.memberships.map((membership) => membership.storeId),
    );
    if (dto.storeIds) {
      this.assertStoreMembership(dto.storeIds);
      this.assertStoreScope(actor, dto.storeIds);
    }
    if (dto.storeIds) await this.assertStoresExist(dto.storeIds);
    const role = dto.role
      ? await this.prisma.role.findUnique({
          where: { key: dto.role },
          select: { id: true },
        })
      : null;
    if (dto.role && !role)
      throw new NotFoundException('Role is not configured. Run the identity seed first.');
    const securityChanged =
      dto.password !== undefined ||
      dto.role !== undefined ||
      dto.isActive !== undefined ||
      dto.storeIds !== undefined;
    return this.prisma.$transaction(async (tx) => {
      if (dto.storeIds) {
        await tx.storeMember.deleteMany({ where: { userId: id } });
        await tx.storeMember.createMany({
          data: dto.storeIds.map((storeId) => ({ userId: id, storeId })),
        });
      }
      if (role) {
        await tx.userRoleLink.deleteMany({ where: { userId: id } });
        await tx.userRoleLink.create({ data: { userId: id, roleId: role.id } });
      }
      const updated = await tx.user.update({
        where: { id },
        data: {
          passwordHash: dto.password ? await argon2.hash(dto.password) : undefined,
          role: dto.role,
          isActive: dto.isActive,
          authVersion: securityChanged ? { increment: 1 } : undefined,
        },
        select: {
          id: true,
          email: true,
          role: true,
          isActive: true,
          authVersion: true,
          memberships: { select: { storeId: true } },
        },
      });
      await this.audit.write(tx, {
        actorId: actor.id,
        action: 'USER_ACCESS_UPDATED',
        targetType: 'USER',
        targetId: updated.id,
        metadata: {
          before: {
            role: user.role,
            isActive: user.isActive,
            storeIds: user.memberships.map((membership) => membership.storeId),
          },
          after: {
            role: updated.role,
            isActive: updated.isActive,
            storeIds: updated.memberships.map((membership) => membership.storeId),
          },
          passwordChanged: dto.password !== undefined,
        },
      });
      return updated;
    });
  }

  private async assertStoresExist(storeIds: string[]): Promise<void> {
    const count = await this.prisma.store.count({
      where: { id: { in: storeIds } },
    });
    if (count !== storeIds.length) throw new NotFoundException('One or more stores do not exist.');
  }

  private assertStoreScope(actor: AuthenticatedUser, storeIds: string[]): void {
    if (actor.isPlatformAdmin) return;
    if (storeIds.some((storeId) => !actor.storeIds.includes(storeId)))
      throw new ForbiddenException('User management is limited to your assigned stores.');
  }

  private assertStoreMembership(storeIds: string[]): void {
    if (storeIds.length === 0)
      throw new BadRequestException('A user must be assigned to at least one store.');
  }

  private async createSession(user: Parameters<AuthService['toAuthenticatedUser']>[0]): Promise<{
    accessToken: string;
    refreshToken: string;
    user: AuthenticatedUser;
  }> {
    const selector = randomUUID();
    const refreshSecret = randomBytes(32).toString('base64url');
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshHash: await argon2.hash(refreshSecret),
        refreshSelector: selector,
        expiresAt: new Date(Date.now() + 2_592_000_000),
      },
    });
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      sid: session.id,
      authVersion: user.authVersion,
    } satisfies JwtPayload);
    return {
      accessToken,
      refreshToken: `${selector}.${refreshSecret}`,
      user: this.toAuthenticatedUser(user, session.id),
    };
  }

  private readonly actorIncludes = {
    memberships: { select: { storeId: true } },
    roleLinks: {
      select: {
        role: {
          select: {
            permissions: { select: { permission: { select: { key: true } } } },
          },
        },
      },
    },
  };

  private toAuthenticatedUser(
    user: {
      id: string;
      email: string;
      role: AuthenticatedUser['role'];
      isPlatformAdmin: boolean;
      authVersion: number;
      memberships: Array<{ storeId: string }>;
      roleLinks: Array<{
        role: { permissions: Array<{ permission: { key: string } }> };
      }>;
    },
    sessionId = '',
  ): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      isPlatformAdmin: user.isPlatformAdmin,
      authVersion: user.authVersion,
      sessionId,
      storeIds: user.memberships.map((membership) => membership.storeId),
      permissions: [
        ...(user.isPlatformAdmin ? ['platform.stores.manage'] : []),
        ...new Set(
          user.roleLinks.flatMap((link) =>
            link.role.permissions.map(({ permission }) => permission.key),
          ),
        ),
      ] as AuthenticatedUser['permissions'],
    };
  }
}
