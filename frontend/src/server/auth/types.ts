/**
 * Core authentication and authorization types for the coding tool.
 * These types define the data structures used across all auth providers.
 */

/**
 * User roles in the system.
 * - system-admin: Full system access across all namespaces, can manage namespaces and all users
 * - namespace-admin: Full access within namespace, can manage users and elevate roles in namespace
 * - instructor: Full access to create sessions, view all data, manage classes within namespace
 * - student: Limited access to join sessions and view own code only within namespace
 */
export type UserRole = 'system-admin' | 'namespace-admin' | 'instructor' | 'student';

/**
 * Granular permissions for fine-grained access control.
 * Permission strings follow the pattern: resource.action
 */
export type Permission =
  // Session permissions
  | 'session.create'
  | 'session.join'
  | 'session.viewAll'
  | 'session.viewOwn'
  | 'session.delete'
  // Class permissions
  | 'class.read'
  | 'class.create'
  | 'class.update'
  | 'class.delete'
  // Section permissions
  | 'section.read'
  | 'section.create'
  | 'section.update'
  | 'section.delete'
  // Problem permissions
  | 'problem.read'
  | 'problem.create'
  | 'problem.update'
  | 'problem.delete'
  // User management permissions
  | 'user.manage'
  | 'user.create'
  | 'user.delete'
  | 'user.viewAll'
  | 'user.changeRole'
  // Data access permissions
  | 'data.viewAll'
  | 'data.viewOwn'
  | 'data.export'
  // Namespace management permissions
  | 'namespace.create'
  | 'namespace.manage'
  | 'namespace.delete'
  | 'namespace.viewAll'
  // System administration
  | 'system.admin';

/**
 * Represents a namespace (organization/tenant) in the system.
 * Each namespace represents an organization, institution, or tenant.
 */
export interface Namespace {
  /** Unique identifier for the namespace (URL-safe slug, e.g., 'stanford', 'mit') */
  id: string;
  /** Human-readable display name (e.g., 'Stanford University') */
  displayName: string;
  /** Whether the namespace is active (soft delete support) */
  active: boolean;
  /** When the namespace was created */
  createdAt: Date;
  /** User ID of the system admin who created this namespace */
  createdBy: string;
  /** When the namespace was last updated */
  updatedAt: Date;
  /** Maximum number of instructors allowed (null = unlimited) */
  maxInstructors?: number | null;
  /** Maximum number of students allowed (null = unlimited) */
  maxStudents?: number | null;
}

/**
 * Capacity usage information for a namespace.
 * Used to check and display how much of the namespace capacity is used.
 */
export interface NamespaceCapacityUsage {
  /** Current number of instructors in the namespace */
  instructorCount: number;
  /** Current number of students in the namespace */
  studentCount: number;
  /** Maximum instructors allowed (null = unlimited) */
  maxInstructors: number | null;
  /** Maximum students allowed (null = unlimited) */
  maxStudents: number | null;
}

/**
 * Data for updating namespace capacity limits.
 */
export interface CapacityLimitsUpdate {
  /** New maximum instructors limit (null = unlimited, undefined = no change) */
  maxInstructors?: number | null;
  /** New maximum students limit (null = unlimited, undefined = no change) */
  maxStudents?: number | null;
}

/**
 * Represents a user account in the system.
 */
export interface User {
  /** Unique identifier for the user (UUID from auth.users) */
  id: string;
  /** Email address for authentication and identification */
  email: string;
  /** User's role determining their permissions */
  role: UserRole;
  /** Namespace this user belongs to (null for system-admin, required for all others) */
  namespaceId: string | null;
  /** Optional display name for the user */
  displayName?: string;
  /** When the user account was created */
  createdAt: Date;
  /** Last time the user logged in */
  lastLoginAt?: Date;
  /** Whether the user's email has been confirmed */
  emailConfirmed?: boolean;
}

/**
 * Active authentication session for a client.
 */
export interface AuthSession {
  /** The authenticated user */
  user: User;
  /** Session identifier */
  sessionId: string;
  /** When this session was created */
  createdAt: Date;
}

/**
 * Request payload for user login.
 */
export interface LoginRequest {
  /** Email address for authentication */
  email: string;
  /** Password for authentication */
  password: string;
}

/**
 * Response after successful authentication.
 */
export interface LoginResponse {
  /** The authenticated user */
  user: User;
  /** Session identifier */
  sessionId: string;
}

/**
 * User with their associated coding sessions.
 * Used for displaying user session history.
 */
export interface UserWithSessions {
  /** The user information */
  user: User;
  /** IDs of coding sessions the user participated in */
  sessionIds: string[];
  /** Count of total sessions */
  sessionCount: number;
}

/**
 * Error thrown when authentication fails.
 */
export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

/**
 * Error thrown when authorization fails (user lacks permission).
 */
export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}
