import { UserRole } from '@prisma/client';

export const permissions = [
  'platform.stores.manage',
  'identity.read',
  'identity.manage',
  'audit.read',
  'catalog.read',
  'catalog.manage',
  'orders.create',
  'orders.read',
  'orders.cancel',
  'shifts.read',
  'shifts.open',
  'shifts.close',
  'shifts.adjust',
  'payments.capture',
  'payments.read',
  'payments.refund',
  'fulfillment.read',
  'fulfillment.manage',
  'inventory.read',
  'inventory.manage',
  'reservations.manage',
  'tables.manage',
  'campaigns.read',
  'campaigns.manage',
  'settings.manage',
  'reports.read',
  'reports.export',
] as const;
export type Permission = (typeof permissions)[number];

// Platform capabilities are granted from the user flag, never by a store role.
// A Store Admin must not accidentally become an administrator of every store.
const allStorePermissions = new Set<Permission>(
  permissions.filter((permission) => permission !== 'platform.stores.manage'),
);
const permissionsByRole: Record<UserRole, ReadonlySet<Permission>> = {
  [UserRole.ADMIN]: allStorePermissions,
  [UserRole.MANAGER]: new Set([
    'catalog.read',
    'catalog.manage',
    'orders.create',
    'orders.read',
    'orders.cancel',
    'shifts.read',
    'shifts.open',
    'shifts.close',
    'shifts.adjust',
    'payments.capture',
    'payments.read',
    'payments.refund',
    'fulfillment.read',
    'fulfillment.manage',
    'inventory.read',
    'inventory.manage',
    'reservations.manage',
    'tables.manage',
    'campaigns.read',
    'campaigns.manage',
    'settings.manage',
    'reports.read',
    'reports.export',
    'audit.read',
  ]),
  [UserRole.CASHIER]: new Set([
    'catalog.read',
    'orders.create',
    'orders.read',
    'orders.cancel',
    'shifts.read',
    'shifts.open',
    'shifts.close',
    'payments.capture',
    'payments.read',
    'payments.refund',
    'fulfillment.read',
    'reservations.manage',
    'tables.manage',
    'campaigns.read',
  ]),
  [UserRole.KITCHEN]: new Set([
    'catalog.read',
    'orders.read',
    'fulfillment.read',
    'fulfillment.manage',
  ]),
  [UserRole.INVENTORY_CLERK]: new Set(['inventory.read', 'inventory.manage']),
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return permissionsByRole[role].has(permission);
}
