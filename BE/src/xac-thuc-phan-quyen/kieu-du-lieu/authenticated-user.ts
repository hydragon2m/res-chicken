import type { UserRole } from '@prisma/client';
import type { Permission } from '../permissions.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  isPlatformAdmin: boolean;
  storeIds: string[];
  permissions: Permission[];
  authVersion: number;
  sessionId: string;
}
