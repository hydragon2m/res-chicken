export type UserRoleEntity = 'ADMIN' | 'MANAGER' | 'CASHIER' | 'KITCHEN' | 'INVENTORY_CLERK';

export type UserEntitySnapshot = Readonly<{
  id: string;
  email: string;
  role: UserRoleEntity;
  isActive: boolean;
  authVersion: number;
}>;

/** Identity aggregate used by authentication and authorization services. */
export class UserEntity {
  private constructor(private readonly snapshot: UserEntitySnapshot) {}

  static rehydrate(snapshot: UserEntitySnapshot): UserEntity {
    return new UserEntity(snapshot);
  }

  canAuthenticate(): boolean {
    return this.snapshot.isActive;
  }

  hasAuthVersion(version: number): boolean {
    return this.snapshot.authVersion === version;
  }
}

export interface RoleEntity {
  id: string;
  key: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}
export interface PermissionEntity {
  id: string;
  key: string;
  createdAt: Date;
}
export interface RolePermissionEntity {
  roleId: string;
  permissionId: string;
}
export interface UserRoleLinkEntity {
  userId: string;
  roleId: string;
}
export interface SessionEntity {
  id: string;
  userId: string;
  refreshHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}
export interface StoreMemberEntity {
  userId: string;
  storeId: string;
  createdAt: Date;
}
