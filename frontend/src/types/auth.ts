/**
 * Client-side auth types.
 *
 * Migrated from @/server/auth/types — pure type definitions.
 */

export type UserRole = 'system-admin' | 'namespace-admin' | 'instructor' | 'student';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  namespaceId: string | null;
  displayName?: string;
  createdAt: Date;
  lastLoginAt?: Date;
  emailConfirmed?: boolean;
}
