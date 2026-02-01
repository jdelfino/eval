/**
 * Persistence layer interface definitions
 *
 * This file defines the contracts for all data persistence operations.
 * These interfaces can be implemented by different storage backends
 * (local files, remote API, in-memory, database, etc.) without requiring
 * changes to the calling code.
 *
 * Design principles:
 * - All methods return Promises for async compatibility
 * - Use null for not-found (don't throw unless error)
 * - Throw PersistenceError for actual errors
 * - Accept Partial<T> for updates to allow selective updates
 */

import { Session } from '../types';
import { IUserRepository } from '../auth/interfaces';
import { IClassRepository, ISectionRepository, IMembershipRepository } from '../classes/interfaces';
import {
  CodeRevision,
  SessionQueryOptions,
  StoredSession,
  StoredRevision,
} from './types';
import { Problem, ProblemMetadata, ProblemFilter, ProblemInput } from '../types/problem';

// Re-export IUserRepository for convenience
export type { IUserRepository };

/**
 * Transaction context interface
 *
 * Provides access to all repositories within a transaction scope.
 * All operations within the transaction are atomic.
 */
export interface TransactionContext {
  sessions: ISessionRepository;
  revisions: IRevisionRepository;
  problems: IProblemRepository;
  users: IUserRepository;
  // Classroom repositories (added in kb3.7)
  classes: IClassRepository;
  sections: ISectionRepository;
  memberships: IMembershipRepository;
}

/**
 * Base interface for all storage backends
 *
 * Provides lifecycle management, health checking, and transaction support.
 */
export interface IStorageBackend {
  /**
   * Initialize the storage backend
   *
   * Should establish connections, create directories, verify credentials, etc.
   * Must be called before using the storage backend.
   *
   * @throws {PersistenceError} if initialization fails
   */
  initialize(): Promise<void>;

  /**
   * Shutdown the storage backend gracefully
   *
   * Should close connections, flush buffers, clean up resources.
   * After shutdown, the backend should not be used.
   */
  shutdown(): Promise<void>;

  /**
   * Check if the storage backend is healthy and available
   *
   * @returns true if storage is accessible and operational
   */
  health(): Promise<boolean>;

  /**
   * Execute operations within a transaction
   *
   * All operations within the transaction function are atomic - either all
   * succeed or all fail. Useful for multi-table operations that must be
   * consistent (e.g., creating a session and enrolling 30 students).
   *
   * @param fn - Function containing transactional operations
   * @returns Result of the transaction function
   * @throws {PersistenceError} if transaction fails
   *
   * @example
   * await storage.transaction(async (tx) => {
   *   const sessionId = await tx.sessions.createSession(session);
   *   for (const student of students) {
   *     await tx.sessions.addStudent(sessionId, student);
   *   }
   *   return sessionId;
   * });
   */
  transaction<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T>;
}

/**
 * Repository interface for session data operations
 *
 * Manages CRUD operations for coding sessions, including active and
 * historical sessions.
 */
export interface ISessionRepository {
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
   * Create a new session
   *
   * @param session - Session data to store
   * @returns The session ID
   * @throws {PersistenceError} with ALREADY_EXISTS if session ID exists
   */
  createSession(session: Session): Promise<string>;

  /**
   * Retrieve a session by ID
   *
   * @param sessionId - Unique session identifier
   * @returns The session data, or null if not found
   */
  getSession(sessionId: string): Promise<StoredSession | null>;

  /**
   * Update an existing session
   *
   * Performs a partial update - only provided fields are modified.
   *
   * @param sessionId - Session to update
   * @param updates - Partial session data to update
   * @throws {PersistenceError} with NOT_FOUND if session doesn't exist
   */
  updateSession(sessionId: string, updates: Partial<Session>): Promise<void>;

  /**
   * Delete a session
   *
   * Removes the session and optionally all related data (revisions, etc).
   *
   * @param sessionId - Session to delete
   * @throws {PersistenceError} with NOT_FOUND if session doesn't exist
   */
  deleteSession(sessionId: string): Promise<void>;

  /**
   * List all currently active sessions
   *
   * @param namespaceId - Optional namespace to filter by (system-admin only)
   * @returns Array of active sessions (where active flag is true)
   */
  listActiveSessions(namespaceId?: string): Promise<StoredSession[]>;

  /**
   * List all sessions with optional filtering and pagination
   *
   * @param options - Query options for filtering and pagination
   * @param namespaceId - Optional namespace to filter by (system-admin only)
   * @returns Array of sessions matching the query
   */
  listAllSessions(options?: SessionQueryOptions, namespaceId?: string): Promise<StoredSession[]>;

  /**
   * Count total sessions (optionally filtered)
   *
   * @param options - Query options for filtering
   * @returns Total number of sessions matching the query
   */
  countSessions(options?: SessionQueryOptions): Promise<number>;
}

/**
 * Repository interface for problem specifications
 *
 * Manages problem definitions, templates, and metadata.
 */
export interface IProblemRepository {
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
   * Create a new problem
   *
   * Generates ID and timestamps automatically.
   *
   * @param problem - Problem data without ID and timestamps
   * @returns The created problem with generated fields
   * @throws {PersistenceError} if validation fails
   */
  create(problem: ProblemInput): Promise<Problem>;

  /**
   * Retrieve a problem by ID
   *
   * @param id - Unique problem identifier
   * @param namespaceId - Optional namespace to filter by (system-admin only)
   * @returns The problem data, or null if not found
   */
  getById(id: string, namespaceId?: string): Promise<Problem | null>;

  /**
   * Get all problems with optional filtering
   *
   * Returns lightweight metadata for efficient listing.
   *
   * @param filter - Optional filters
   * @param namespaceId - Optional namespace to filter by (system-admin only)
   * @returns Array of problem metadata
   */
  getAll(filter?: ProblemFilter, namespaceId?: string): Promise<ProblemMetadata[]>;

  /**
   * Update an existing problem
   *
   * Performs partial update - only provided fields are modified.
   * Updates updatedAt timestamp automatically.
   *
   * @param id - Problem to update
   * @param updates - Partial problem data to update
   * @returns Updated problem
   * @throws {PersistenceError} with NOT_FOUND if problem doesn't exist
   */
  update(id: string, updates: Partial<Problem>): Promise<Problem>;

  /**
   * Delete a problem
   *
   * @param id - Problem to delete
   * @throws {PersistenceError} with NOT_FOUND if problem doesn't exist
   */
  delete(id: string): Promise<void>;

  /**
   * Search problems by query string
   *
   * Searches in title and description.
   *
   * @param query - Search query
   * @param filter - Optional additional filters
   * @param namespaceId - Optional namespace to filter by (system-admin only)
   * @returns Array of matching problem metadata
   */
  search(query: string, filter?: ProblemFilter, namespaceId?: string): Promise<ProblemMetadata[]>;

  /**
   * Get problems by author
   *
   * @param authorId - Author user ID
   * @param filter - Optional additional filters
   * @param namespaceId - Optional namespace to filter by (system-admin only)
   * @returns Array of author's problems
   */
  getByAuthor(authorId: string, filter?: ProblemFilter, namespaceId?: string): Promise<ProblemMetadata[]>;

  /**
   * Get problems by class
   *
   * @param classId - Class ID
   * @param filter - Optional additional filters
   * @param namespaceId - Optional namespace to filter by (system-admin only)
   * @returns Array of class problems
   */
  getByClass(classId: string, filter?: ProblemFilter, namespaceId?: string): Promise<ProblemMetadata[]>;

  /**
   * Duplicate a problem with new title
   *
   * Creates a copy with new ID and specified title.
   *
   * @param id - Problem to duplicate
   * @param newTitle - Title for the duplicate
   * @returns The duplicated problem
   * @throws {PersistenceError} with NOT_FOUND if problem doesn't exist
   */
  duplicate(id: string, newTitle: string): Promise<Problem>;
}

/**
 * Repository interface for code revision history
 *
 * Manages student code snapshots and revision tracking.
 */
export interface IRevisionRepository {
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
   * Save a code revision
   *
   * Appends a new revision to the student's history for this session.
   *
   * @param revision - Revision data to store
   * @returns The revision ID
   */
  saveRevision(revision: CodeRevision): Promise<string>;

  /**
   * Get all revisions for a student in a session
   *
   * Revisions are returned in chronological order (oldest first).
   *
   * @param sessionId - Session identifier
   * @param studentId - Student identifier
   * @param namespaceId - Optional namespace to validate (namespace must match session's namespace)
   * @returns Array of revisions
   */
  getRevisions(sessionId: string, studentId: string, namespaceId?: string): Promise<StoredRevision[]>;

  /**
   * Get a specific revision by ID
   *
   * @param revisionId - Unique revision identifier
   * @returns The revision data, or null if not found
   */
  getRevision(revisionId: string): Promise<StoredRevision | null>;

  /**
   * Get the latest revision for a student in a session
   *
   * @param sessionId - Session identifier
   * @param studentId - Student identifier
   * @returns The most recent revision, or null if no revisions exist
   */
  getLatestRevision(sessionId: string, studentId: string): Promise<StoredRevision | null>;

  /**
   * Delete all revisions for a student in a session
   *
   * If studentId is not provided, deletes all revisions for the session.
   *
   * @param sessionId - Session identifier
   * @param studentId - Optional student identifier
   */
  deleteRevisions(sessionId: string, studentId?: string): Promise<void>;

  /**
   * Count revisions for a student in a session
   *
   * @param sessionId - Session identifier
   * @param studentId - Student identifier
   * @returns Total number of revisions
   */
  countRevisions(sessionId: string, studentId: string): Promise<number>;

  /**
   * Get revision history for all students in a session
   *
   * Useful for instructor overview of all student work.
   *
   * @param sessionId - Session identifier
   * @param namespaceId - Optional namespace to validate (namespace must match session's namespace)
   * @returns Map of studentId to array of revisions
   */
  getAllSessionRevisions(sessionId: string, namespaceId?: string): Promise<Map<string, StoredRevision[]>>;
}

/**
 * Composite repository interface
 *
 * Combines all repositories into a single interface for convenience.
 * Implementations can provide all repositories from a single backend.
 */
export interface IStorageRepository extends IStorageBackend {
  /** Session data operations */
  sessions: ISessionRepository;

  /** Revision data operations */
  revisions: IRevisionRepository;

  /** User data operations */
  users: IUserRepository;

  /** Problem data operations */
  problems: IProblemRepository;

  /** Class data operations (multi-tenancy) */
  classes: import('../classes/interfaces').IClassRepository;

  /** Section data operations (multi-tenancy) */
  sections: import('../classes/interfaces').ISectionRepository;

  /** Section membership operations (multi-tenancy) */
  memberships: import('../classes/interfaces').IMembershipRepository;
}
