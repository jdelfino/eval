/**
 * Audit logging for security-sensitive operations
 */

import { UserRole } from './types';

/**
 * Audit log entry for role changes and other admin actions
 */
export interface AuditLogEntry {
  /** Unique identifier for this audit entry */
  id: string;
  
  /** Type of action performed */
  action: 'role_change' | 'user_create' | 'user_delete';
  
  /** User who performed the action (actor) */
  actorId: string;
  actorUsername: string;
  actorRole: UserRole;
  
  /** User being affected (target) */
  targetId: string;
  targetUsername: string;
  
  /** Details specific to the action */
  details: RoleChangeDetails | UserCreateDetails | UserDeleteDetails;
  
  /** When the action occurred */
  timestamp: Date;
  
  /** IP address or client identifier (optional) */
  clientInfo?: string;
}

/**
 * Details for role change actions
 */
export interface RoleChangeDetails {
  action: 'role_change';
  oldRole: UserRole;
  newRole: UserRole;
}

/**
 * Details for user creation actions
 */
export interface UserCreateDetails {
  action: 'user_create';
  initialRole: UserRole;
}

/**
 * Details for user deletion actions
 */
export interface UserDeleteDetails {
  action: 'user_delete';
  roleAtDeletion: UserRole;
}

/**
 * Filters for querying audit logs
 */
export interface AuditLogFilters {
  /** Filter by action type */
  action?: AuditLogEntry['action'];
  
  /** Filter by actor user ID */
  actorId?: string;
  
  /** Filter by target user ID */
  targetId?: string;
  
  /** Filter by date range */
  startDate?: Date;
  endDate?: Date;
  
  /** Pagination */
  limit?: number;
  offset?: number;
}

/**
 * Audit log repository interface
 */
export interface IAuditLogRepository {
  /**
   * Create a new audit log entry
   */
  createEntry(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<AuditLogEntry>;
  
  /**
   * Get audit log entries with optional filters
   */
  getEntries(filters?: AuditLogFilters): Promise<AuditLogEntry[]>;
  
  /**
   * Get a specific audit log entry by ID
   */
  getEntry(id: string): Promise<AuditLogEntry | null>;
  
  /**
   * Get total count of entries (for pagination)
   */
  getCount(filters?: AuditLogFilters): Promise<number>;
}
