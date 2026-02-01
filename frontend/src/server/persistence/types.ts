/**
 * Persistence layer type definitions
 *
 * This file contains types used across the persistence layer for configuration,
 * error handling, and metadata management.
 */

import { Session } from '../types';

/**
 * Configuration options for storage backends
 */
export interface StorageConfig {
  /** Type of storage backend to use */
  type: 'supabase';
}

/**
 * Metadata attached to stored items
 */
export interface StorageMetadata {
  /** When the item was first created */
  createdAt: Date;

  /** When the item was last modified */
  updatedAt: Date;

  /** Version number for optimistic locking */
  version: number;

  /** User or system that created the item */
  createdBy?: string;

  /** User or system that last modified the item */
  modifiedBy?: string;
}

/**
 * Code revision for tracking student code changes
 */
export interface CodeRevision {
  /** Unique revision identifier */
  id: string;

  /** Namespace this revision belongs to */
  namespaceId: string;

  /** Session this revision belongs to */
  sessionId: string;

  /** Student who made this revision */
  studentId: string;

  /** When this revision was created */
  timestamp: Date;

  /** Whether this revision stores a diff or full code snapshot */
  isDiff: boolean;

  /** Diff patches (if isDiff is true) */
  diff?: string;

  /** Full code snapshot (if isDiff is false) */
  fullCode?: string;

  /** Optional: Base revision ID for diff application (future use) */
  baseRevisionId?: string;

  /** Optional: execution result if code was run */
  executionResult?: {
    success: boolean;
    output: string;
    error: string;
  };
}

/**
 * Problem specification for coding exercises
 */
export interface ProblemSpec {
  /** Unique problem identifier */
  id: string;

  /** Problem title */
  title: string;

  /** Problem description/instructions */
  description: string;

  /** Starter code template for students */
  starterCode?: string;

  /** Expected solution (hidden from students) */
  solution?: string;

  /** Difficulty level */
  difficulty?: 'beginner' | 'intermediate' | 'advanced';

  /** Topic tags */
  tags?: string[];

  /** When this problem was created */
  createdAt: Date;

  /** Who created this problem */
  createdBy?: string;
}

/**
 * Custom error types for persistence layer
 */
export class PersistenceError extends Error {
  constructor(
    message: string,
    public code: PersistenceErrorCode,
    public details?: unknown
  ) {
    super(message);
    this.name = 'PersistenceError';
  }
}

/**
 * Error codes for persistence operations
 */
export enum PersistenceErrorCode {
  /** Item not found in storage */
  NOT_FOUND = 'NOT_FOUND',

  /** Item already exists (duplicate key) */
  ALREADY_EXISTS = 'ALREADY_EXISTS',

  /** Storage backend is not available */
  UNAVAILABLE = 'UNAVAILABLE',

  /** Invalid data format or validation failed */
  INVALID_DATA = 'INVALID_DATA',

  /** Operation timed out */
  TIMEOUT = 'TIMEOUT',

  /** Permission denied */
  PERMISSION_DENIED = 'PERMISSION_DENIED',

  /** Version conflict (optimistic locking) */
  CONFLICT = 'CONFLICT',

  /** Generic storage error */
  STORAGE_ERROR = 'STORAGE_ERROR',
}

/**
 * Result of a persistence operation
 */
export interface OperationResult<T = void> {
  /** Whether the operation succeeded */
  success: boolean;

  /** Data returned from operation (if any) */
  data?: T;

  /** Error information if operation failed */
  error?: {
    code: PersistenceErrorCode;
    message: string;
    details?: unknown;
  };
}

/**
 * Options for querying sessions
 */
export interface SessionQueryOptions {
  /** Filter by active/inactive status */
  active?: boolean;

  /** Filter by instructor ID */
  instructorId?: string;

  /** Filter by section ID */
  sectionId?: string;

  /** Limit number of results */
  limit?: number;

  /** Skip N results (for pagination) */
  offset?: number;

  /** Sort field */
  sortBy?: 'createdAt' | 'lastActivity' | 'joinCode';

  /** Sort direction */
  sortOrder?: 'asc' | 'desc';

  /** Filter by namespace ID */
  namespaceId?: string;
}

/**
 * Extended session data with persistence metadata
 */
export interface StoredSession extends Session {
  /** Persistence metadata */
  _metadata?: StorageMetadata;
}

/**
 * Extended problem with persistence metadata
 */
export interface StoredProblem extends ProblemSpec {
  /** Persistence metadata */
  _metadata?: StorageMetadata;
}

/**
 * Extended revision with persistence metadata
 */
export interface StoredRevision extends CodeRevision {
  /** Persistence metadata */
  _metadata?: StorageMetadata;
}
