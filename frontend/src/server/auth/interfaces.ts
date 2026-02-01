/**
 * Interfaces for authentication and authorization services.
 * These interfaces define contracts that can be implemented by different
 * auth providers (local, OAuth, third-party services, etc.) for easy swapping.
 */

import { User, UserRole, AuthSession, Namespace, NamespaceCapacityUsage, CapacityLimitsUpdate } from './types';
import type { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Authentication provider interface.
 * Implementations handle user authentication and management.
 */
export interface IAuthProvider {
  /**
   * User repository for direct data access operations.
   * Exposed for admin operations that need batch queries.
   */
  readonly userRepository: IUserRepository;

  /**
   * Authenticate a user with email and password.
   *
   * @param email - User's email address
   * @param password - User's password
   * @returns User if authentication successful, null otherwise
   */
  authenticateWithPassword(email: string, password: string): Promise<User | null>;

  /**
   * Register a new user account.
   *
   * @param email - User's email address
   * @param password - User's password
   * @param role - User's role (system-admin, namespace-admin, instructor, or student)
   * @param namespaceId - Namespace ID (null for system-admin, required for others)
   * @returns The newly created user
   * @throws {Error} If user already exists or creation fails
   */
  signUp(
    email: string,
    password: string,
    role: UserRole,
    namespaceId?: string | null
  ): Promise<User>;

  /**
   * Get a user by their ID.
   *
   * @param userId - User's unique identifier
   * @returns User if found, null otherwise
   */
  getUser(userId: string): Promise<User | null>;

  /**
   * Update user information.
   *
   * @param userId - User's unique identifier
   * @param updates - Partial user object with fields to update
   * @throws {Error} If user not found or update fails
   */
  updateUser(userId: string, updates: Partial<User>): Promise<void>;

  /**
   * Delete a user account.
   *
   * @param userId - User's unique identifier
   * @throws {Error} If user not found or deletion fails
   */
  deleteUser(userId: string): Promise<void>;

  /**
   * Get session from a Next.js request (reads JWT from cookies).
   *
   * @param request - Next.js request object
   * @returns Session if valid JWT found, null otherwise
   */
  getSessionFromRequest(request: NextRequest): Promise<AuthSession | null>;

  /**
   * Get an active session by JWT token.
   *
   * @param accessToken - JWT access token
   * @returns Session if token is valid, null otherwise
   */
  getSession(accessToken: string): Promise<AuthSession | null>;

  /**
   * Sign out (destroy session).
   */
  signOut(): Promise<void>;

  /**
   * Get configured Supabase client for specific context.
   *
   * @param context - 'server' for user-context (with RLS), 'admin' for service role
   * @returns Configured Supabase client (may be async for 'server' context)
   */
  getSupabaseClient(context: 'server'): Promise<SupabaseClient>;
  getSupabaseClient(context: 'admin'): SupabaseClient;
  getSupabaseClient(context: 'server' | 'admin'): SupabaseClient | Promise<SupabaseClient>;

  /**
   * Get all users in the system.
   * For admin purposes only.
   *
   * @returns Array of all users
   */
  getAllUsers(): Promise<User[]>;
}

/**
 * User repository interface for data persistence.
 * Separates data storage from authentication logic.
 */
export interface IUserRepository {
  /**
   * Initialize the repository.
   * Can be no-op for implementations that don't need setup.
   */
  initialize?(): Promise<void>;

  /**
   * Shutdown the repository gracefully.
   * Can be no-op for implementations that don't need cleanup.
   */
  shutdown?(): Promise<void>;

  /**
   * Check if repository is healthy.
   * Can return true for implementations without health checks.
   */
  health?(): Promise<boolean>;

  /**
   * Save a user to storage.
   * Creates new user if not exists, updates if exists.
   *
   * @param user - User to save
   */
  saveUser(user: User): Promise<void>;

  /**
   * Get a user by their ID.
   *
   * @param userId - User's unique identifier
   * @returns User if found, null otherwise
   */
  getUser(userId: string): Promise<User | null>;

  /**
   * Get a user by their email.
   *
   * @param email - User's email
   * @returns User if found, null otherwise
   */
  getUserByEmail(email: string): Promise<User | null>;

  /**
   * List all users, optionally filtered by role and/or namespace.
   *
   * @param role - Optional role filter
   * @param namespaceId - Optional namespace filter (null for system-admin users)
   * @returns Array of users
   */
  listUsers(role?: UserRole, namespaceId?: string | null): Promise<User[]>;

  /**
   * Get all users in a specific namespace.
   *
   * @param namespaceId - Namespace ID to filter by
   * @returns Array of users in the namespace
   */
  getUsersByNamespace(namespaceId: string): Promise<User[]>;

  /**
   * Update user information.
   *
   * @param userId - User's unique identifier
   * @param updates - Partial user object with fields to update
   * @throws {Error} If user not found
   */
  updateUser(userId: string, updates: Partial<User>): Promise<void>;

  /**
   * Delete a user from storage.
   *
   * @param userId - User's unique identifier
   * @throws {Error} If user not found
   */
  deleteUser(userId: string): Promise<void>;
}

/**
 * Role-Based Access Control (RBAC) service interface.
 * Handles authorization and permission checking.
 */
export interface IRBACService {
  /**
   * Check if a user has a specific permission.
   *
   * @param user - User to check
   * @param permission - Permission string (e.g., 'session.create')
   * @returns True if user has permission, false otherwise
   */
  hasPermission(user: User, permission: string): boolean;

  /**
   * Check if a user can access a specific coding session.
   * Instructors can access all sessions.
   * Students can only access sessions they're enrolled in.
   *
   * @param user - User to check
   * @param sessionId - Session ID to check access for
   * @returns True if user can access session, false otherwise
   */
  canAccessSession(user: User, sessionId: string): Promise<boolean>;

  /**
   * Check if a user can manage (modify/delete) another user.
   * Typically, only instructors can manage users.
   *
   * @param actor - User attempting the action
   * @param target - User being managed
   * @returns True if actor can manage target, false otherwise
   */
  canManageUser(actor: User, target: User): boolean;

  /**
   * Get all permissions for a given role.
   *
   * @param role - User role
   * @returns Array of permission strings
   */
  getRolePermissions(role: UserRole): string[];
}

/**
 * Namespace repository interface.
 * Handles CRUD operations for namespaces (organizations/tenants).
 */
export interface INamespaceRepository {
  /**
   * Initialize the repository (load data from disk, etc.)
   */
  initialize(): Promise<void>;

  /**
   * Create a new namespace.
   *
   * @param namespace - Namespace data to create
   * @returns The created namespace
   * @throws {Error} If namespace ID already exists or is invalid
   */
  createNamespace(namespace: Namespace): Promise<Namespace>;

  /**
   * Get a namespace by its ID.
   *
   * @param id - Namespace ID (slug)
   * @returns Namespace if found, null otherwise
   */
  getNamespace(id: string): Promise<Namespace | null>;

  /**
   * List all namespaces.
   *
   * @param includeInactive - Whether to include soft-deleted namespaces (default: false)
   * @returns Array of namespaces
   */
  listNamespaces(includeInactive?: boolean): Promise<Namespace[]>;

  /**
   * Update a namespace.
   *
   * @param id - Namespace ID to update
   * @param updates - Partial namespace object with fields to update
   * @throws {Error} If namespace not found
   */
  updateNamespace(id: string, updates: Partial<Namespace>): Promise<void>;

  /**
   * Soft delete a namespace (set active=false).
   *
   * @param id - Namespace ID to delete
   * @throws {Error} If namespace not found
   */
  deleteNamespace(id: string): Promise<void>;

  /**
   * Check if a namespace exists.
   *
   * @param id - Namespace ID to check
   * @returns True if namespace exists, false otherwise
   */
  namespaceExists(id: string): Promise<boolean>;

  /**
   * Get capacity usage for a namespace.
   *
   * Returns current counts of instructors and students, along with
   * the configured limits. Used for displaying capacity info and
   * checking if new users can be added.
   *
   * @param id - Namespace ID
   * @returns Capacity usage info, or null if namespace not found
   */
  getCapacityUsage(id: string): Promise<NamespaceCapacityUsage | null>;

  /**
   * Update capacity limits for a namespace.
   *
   * @param id - Namespace ID
   * @param limits - New limits (null values = unlimited)
   * @throws {Error} If namespace not found
   */
  updateCapacityLimits(id: string, limits: CapacityLimitsUpdate): Promise<void>;
}
