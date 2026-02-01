/**
 * ExecutorService - Orchestrates Code Execution
 *
 * High-level service that manages code execution across different backends.
 * Handles backend selection, session-to-backend mapping, and error sanitization.
 *
 * Responsibilities:
 * - Select appropriate backend for execution
 * - Track which backend is assigned to which session
 * - Manage session lifecycle (warmup, cleanup)
 * - Sanitize errors before returning to clients
 */

import {
  ICodeExecutionBackend,
  ISessionScopedBackend,
  IBackendStateRepository,
  CodeSubmission,
  ExecutionResult,
  ExecutionTrace,
  TraceOptions,
} from './interfaces';
import { getBackendRegistry } from './registry';
import { SupabaseBackendStateRepository } from './supabase-state-repository';
import { sanitizeError } from './utils';

export class ExecutorService {
  constructor(private stateRepository: IBackendStateRepository) {}

  /**
   * Execute code and return result
   *
   * @param submission - Code and execution settings
   * @param timeout - Optional timeout in milliseconds
   * @param sessionId - Optional session ID for backend assignment lookup
   * @returns Execution result with sanitized errors
   */
  async executeCode(
    submission: CodeSubmission,
    timeout?: number,
    sessionId?: string
  ): Promise<ExecutionResult> {
    const backend = await this.getBackendForSession(sessionId);
    if (!backend) {
      return {
        success: false,
        output: '',
        error: 'No backend available',
        executionTime: 0,
      };
    }

    const result = await backend.execute(submission, { timeout, sessionId });

    // Apply error sanitization
    if (!result.success && result.error) {
      result.error = sanitizeError(result.error);
    }

    return result;
  }

  /**
   * Trace code execution step-by-step
   *
   * @param code - Python code to trace
   * @param options - Trace options (executionSettings, maxSteps, sessionId)
   * @returns Execution trace or error
   */
  async traceExecution(
    code: string,
    options?: TraceOptions
  ): Promise<ExecutionTrace> {
    const backend = await this.getBackendForSession(options?.sessionId);
    if (!backend?.capabilities.trace || !backend.trace) {
      return {
        steps: [],
        totalSteps: 0,
        exitCode: 1,
        error: 'Tracing not available',
        truncated: false,
      };
    }

    return backend.trace(code, options);
  }

  /**
   * Prepare a backend for a session
   *
   * Called when a session is created. Assigns a backend and warms it up if needed.
   *
   * @param sessionId - Session to prepare for
   */
  async prepareForSession(sessionId: string): Promise<void> {
    const backendType = this.selectBackendType();
    await this.stateRepository.assignBackend(sessionId, backendType);

    const backend = getBackendRegistry().get(backendType);
    if (backend && this.isSessionScoped(backend)) {
      await backend.warmup(sessionId);
    }
  }

  /**
   * Clean up resources when session ends
   *
   * Called when a session is completed. Releases backend resources.
   *
   * @param sessionId - Session to clean up
   */
  async cleanupSession(sessionId: string): Promise<void> {
    const backend = await this.getBackendForSession(sessionId);
    if (backend && this.isSessionScoped(backend)) {
      await backend.cleanup(sessionId);
    }
  }

  /**
   * Get the backend for a session
   *
   * If sessionId is provided, looks up assigned backend from state repository.
   * Falls back to registry.select() when:
   * - No sessionId provided
   * - Session has no assigned backend
   * - Assigned backend is not found in registry
   *
   * @param sessionId - Optional session ID
   * @returns Backend instance or null
   */
  private async getBackendForSession(
    sessionId?: string
  ): Promise<ICodeExecutionBackend | null> {
    if (sessionId) {
      const backendType = await this.stateRepository.getAssignedBackend(sessionId);
      if (backendType) {
        const backend = getBackendRegistry().get(backendType);
        if (backend) {
          return backend;
        }
        // Assigned backend not found in registry, fall through to select()
      }
    }

    return getBackendRegistry().select();
  }

  /**
   * Select backend type based on environment
   *
   * Selection logic:
   * - On Vercel with sandbox enabled: vercel-sandbox
   * - On Vercel without sandbox: disabled
   * - Otherwise: local-python
   *
   * @returns Backend type identifier
   */
  private selectBackendType(): string {
    if (process.env.VERCEL && process.env.VERCEL_SANDBOX_ENABLED) {
      return 'vercel-sandbox';
    }
    if (process.env.VERCEL) {
      return 'disabled';
    }
    return 'local-python';
  }

  /**
   * Type guard to check if backend is session-scoped
   */
  private isSessionScoped(
    backend: ICodeExecutionBackend
  ): backend is ISessionScopedBackend {
    return backend.capabilities.stateful;
  }
}

// Singleton instance
let executorService: ExecutorService | null = null;

/**
 * Get the global ExecutorService instance
 *
 * Creates the instance on first call with SupabaseBackendStateRepository.
 */
export function getExecutorService(): ExecutorService {
  if (!executorService) {
    executorService = new ExecutorService(new SupabaseBackendStateRepository());
  }
  return executorService;
}

/**
 * Reset the executor service (for testing)
 *
 * Clears the singleton instance so tests can inject their own dependencies.
 */
export function resetExecutorService(): void {
  executorService = null;
}
