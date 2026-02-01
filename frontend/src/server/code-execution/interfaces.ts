/**
 * Code Execution Backend Abstraction Layer - Interface Definitions
 *
 * This module defines the contracts for pluggable code execution backends.
 * Backends can be stateless (LocalPython) or session-scoped (VercelSandbox, Docker).
 *
 * Design principles:
 * - All methods return Promises for async compatibility
 * - Backends declare their capabilities upfront
 * - Session-scoped backends extend the base interface with lifecycle methods
 * - State repository abstracts backend-specific persistence
 */

import { CodeSubmission, ExecutionResult, ExecutionTrace, ExecutionSettings } from '../types';

/**
 * Capabilities that backends may support
 */
export interface BackendCapabilities {
  /** Supports code execution */
  execute: boolean;
  /** Supports execution tracing/debugging */
  trace: boolean;
  /** Supports file attachments */
  attachedFiles: boolean;
  /** Supports stdin input */
  stdin: boolean;
  /** Supports random seed injection */
  randomSeed: boolean;
  /** Backend maintains state across calls (requires lifecycle management) */
  stateful: boolean;
  /** Backend requires warm-up time (e.g., sandbox creation) */
  requiresWarmup: boolean;
}

/**
 * Backend status for health checks and diagnostics
 */
export interface BackendStatus {
  /** Whether backend is available for use */
  available: boolean;
  /** Whether backend is currently healthy */
  healthy: boolean;
  /** Human-readable status message */
  message?: string;
  /** Additional diagnostic metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Options for code execution
 */
export interface ExecuteOptions {
  /** Timeout in milliseconds */
  timeout?: number;
  /** Session ID for session-scoped backends */
  sessionId?: string;
}

/**
 * Options for code tracing
 */
export interface TraceOptions {
  /** Execution settings (stdin, files, randomSeed) */
  executionSettings?: ExecutionSettings;
  /** Maximum number of trace steps */
  maxSteps?: number;
  /** Session ID for session-scoped backends */
  sessionId?: string;
}

/**
 * Core code execution backend interface
 *
 * Backends implement this interface to provide code execution capabilities.
 * All backends must support execute(); trace() is optional.
 */
export interface ICodeExecutionBackend {
  /** Unique identifier for this backend type */
  readonly backendType: string;

  /** Backend capabilities */
  readonly capabilities: BackendCapabilities;

  /**
   * Execute code and return result
   *
   * @param submission - Code and execution settings
   * @param options - Execution options (timeout, sessionId)
   * @returns Execution result
   */
  execute(submission: CodeSubmission, options?: ExecuteOptions): Promise<ExecutionResult>;

  /**
   * Trace code execution step-by-step
   *
   * Optional - check capabilities.trace before calling.
   *
   * @param code - Python code to trace
   * @param options - Trace options
   * @returns Execution trace or error
   */
  trace?(code: string, options?: TraceOptions): Promise<ExecutionTrace>;

  /**
   * Get backend status
   */
  getStatus(): Promise<BackendStatus>;
}

/**
 * Extended interface for stateful backends that maintain per-session state
 *
 * Session-scoped backends (like Vercel Sandbox) need lifecycle management:
 * - warmup(): Called when session is created to prepare the backend
 * - cleanup(): Called when session ends to release resources
 */
export interface ISessionScopedBackend extends ICodeExecutionBackend {
  /**
   * Prepare backend for a session
   *
   * Called when a session is created. May create sandbox, allocate resources, etc.
   * For backends with requiresWarmup=true, this should be called eagerly.
   *
   * @param sessionId - Session to prepare for
   * @returns Backend-specific identifier (e.g., sandbox ID) or null
   */
  warmup(sessionId: string): Promise<string | null>;

  /**
   * Check if backend is ready for a session
   *
   * @param sessionId - Session to check
   * @returns true if backend is ready for execution
   */
  isReady(sessionId: string): Promise<boolean>;

  /**
   * Clean up resources when session ends
   *
   * Called when a session is completed. Should release resources gracefully.
   * Failures should be logged but not thrown (resources will timeout anyway).
   *
   * @param sessionId - Session to clean up
   */
  cleanup(sessionId: string): Promise<void>;
}

/**
 * Repository interface for backend state persistence
 *
 * Tracks which backend each session uses and stores backend-specific state
 * (sandbox IDs, container IDs, etc.) across serverless invocations.
 */
export interface IBackendStateRepository {
  /**
   * Assign a backend type to a session
   *
   * Called once when session is created. Records which backend this session uses.
   *
   * @param sessionId - Session ID
   * @param backendType - Backend type identifier (e.g., 'vercel-sandbox', 'local-python')
   */
  assignBackend(sessionId: string, backendType: string): Promise<void>;

  /**
   * Get the assigned backend type for a session
   *
   * @param sessionId - Session ID
   * @returns Backend type or null if not assigned
   */
  getAssignedBackend(sessionId: string): Promise<string | null>;

  /**
   * Save backend-specific state for a session
   *
   * Used by session-scoped backends to persist state (e.g., sandbox IDs).
   *
   * @param sessionId - Session ID
   * @param state - Backend-specific state object
   */
  saveState(sessionId: string, state: Record<string, unknown>): Promise<void>;

  /**
   * Get backend-specific state for a session
   *
   * @param sessionId - Session ID
   * @returns State object or null if not found
   */
  getState(sessionId: string): Promise<Record<string, unknown> | null>;

  /**
   * Delete backend state for a session
   *
   * Called when session ends or backend is cleaned up.
   *
   * @param sessionId - Session ID
   */
  deleteState(sessionId: string): Promise<void>;

  /**
   * Check if state exists for a session
   *
   * @param sessionId - Session ID
   * @returns true if state exists
   */
  hasState(sessionId: string): Promise<boolean>;
}

// Re-export types from ../types for convenience
export type { CodeSubmission, ExecutionResult, ExecutionTrace, ExecutionSettings };
