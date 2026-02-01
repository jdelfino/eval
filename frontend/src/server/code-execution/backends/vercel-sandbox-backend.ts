/**
 * Vercel Sandbox Backend
 *
 * Implements ISessionScopedBackend using Vercel's Sandbox service.
 * Sandboxes are created eagerly when sessions are warmed up and reused
 * across executions within the session.
 *
 * Architecture:
 * - warmup(): Creates Vercel sandbox, saves state via IBackendStateRepository
 * - execute(): Gets sandbox from state, writes files, runs Python
 * - trace(): Gets sandbox, writes tracer + code, runs tracer, parses output
 * - cleanup(): Stops sandbox, deletes state
 *
 * Timeout handling:
 * - Sandbox timeout: 45 minutes (Hobby plan max)
 * - If sandbox times out, getSandbox() recreates it automatically
 * - Per-execution timeout: 10 seconds
 */

import { Sandbox } from '@vercel/sandbox';
import {
  ISessionScopedBackend,
  IBackendStateRepository,
  BackendCapabilities,
  BackendStatus,
  ExecuteOptions,
  TraceOptions,
  CodeSubmission,
  ExecutionResult,
  ExecutionTrace,
} from '../interfaces';
import { sanitizeFilename, truncateOutput } from '../utils';
import { logSandboxEvent } from '../logger';
import { TRACER_SCRIPT, TRACER_PATH } from './tracer-script';

// Session sandbox timeout: 45 minutes (Hobby plan max)
const SESSION_TIMEOUT_MS = 45 * 60 * 1000;

// Per-execution timeout: 10 seconds
const EXECUTION_TIMEOUT_MS = 10_000;

// Working directory for code execution
const SANDBOX_CWD = '/vercel/sandbox';

// Default max steps for tracing
const DEFAULT_MAX_STEPS = 5000;

/**
 * Error thrown when sandbox operations fail
 */
export class SandboxError extends Error {
  constructor(
    message: string,
    public readonly code: 'CREATION_FAILED' | 'RECONNECTION_FAILED' | 'EXECUTION_FAILED' | 'TIMEOUT' | 'UNAVAILABLE',
    public readonly sessionId?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'SandboxError';
  }
}

/**
 * Vercel Sandbox implementation of ISessionScopedBackend
 *
 * Uses IBackendStateRepository for state persistence instead of direct Supabase queries.
 */
export class VercelSandboxBackend implements ISessionScopedBackend {
  readonly backendType = 'vercel-sandbox';

  readonly capabilities: BackendCapabilities = {
    execute: true,
    trace: true,
    attachedFiles: true,
    stdin: true,
    randomSeed: true,
    stateful: true,
    requiresWarmup: true,
  };

  constructor(private readonly stateRepository: IBackendStateRepository) {}

  /**
   * Prepare backend for a session by creating a Vercel sandbox
   *
   * @param sessionId - Session to prepare for
   * @returns Sandbox ID
   */
  async warmup(sessionId: string): Promise<string | null> {
    const startTime = Date.now();

    try {
      const sandbox = await Sandbox.create({
        runtime: 'python3.13',
        timeout: SESSION_TIMEOUT_MS,
      });

      // Store sandbox ID via repository
      await this.stateRepository.saveState(sessionId, { sandboxId: sandbox.sandboxId });

      logSandboxEvent({
        event: 'sandbox_create',
        sessionId,
        sandboxId: sandbox.sandboxId,
        durationMs: Date.now() - startTime,
        success: true,
      });

      return sandbox.sandboxId;
    } catch (error) {
      logSandboxEvent({
        event: 'sandbox_create',
        sessionId,
        durationMs: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorCode: error instanceof SandboxError ? error.code : undefined,
      });

      if (error instanceof SandboxError) {
        throw error;
      }
      throw new SandboxError(
        `Failed to create sandbox: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CREATION_FAILED',
        sessionId,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Check if backend is ready for a session
   *
   * @param sessionId - Session to check
   * @returns true if backend has state for this session
   */
  async isReady(sessionId: string): Promise<boolean> {
    return this.stateRepository.hasState(sessionId);
  }

  /**
   * Clean up resources when session ends
   *
   * @param sessionId - Session to clean up
   */
  async cleanup(sessionId: string): Promise<void> {
    const startTime = Date.now();

    try {
      // Get sandbox ID from state
      const state = await this.stateRepository.getState(sessionId);

      if (!state) {
        // No state record - nothing to clean up
        logSandboxEvent({
          event: 'sandbox_cleanup',
          sessionId,
          durationMs: Date.now() - startTime,
          success: true,
          metadata: { noRecord: true },
        });
        return;
      }

      const sandboxId = state.sandboxId as string;

      // Stop sandbox (best effort)
      let stopError: string | undefined;
      try {
        const sandbox = await Sandbox.get({ sandboxId });
        if (sandbox.status === 'running') {
          await sandbox.stop();
        }
      } catch (error) {
        stopError = error instanceof Error ? error.message : 'Unknown error';
        // Continue with cleanup - sandbox may already be stopped
      }

      // Delete state record
      await this.stateRepository.deleteState(sessionId);

      logSandboxEvent({
        event: 'sandbox_cleanup',
        sessionId,
        sandboxId,
        durationMs: Date.now() - startTime,
        success: true,
        metadata: stopError ? { stopWarning: stopError } : undefined,
      });
    } catch (error) {
      logSandboxEvent({
        event: 'sandbox_cleanup',
        sessionId,
        durationMs: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Don't throw - sandbox will auto-timeout
    }
  }

  /**
   * Execute code on Vercel Sandbox
   *
   * @param submission - Code and execution settings
   * @param options - Execution options
   * @returns Execution result
   */
  async execute(submission: CodeSubmission, options?: ExecuteOptions): Promise<ExecutionResult> {
    const startTime = Date.now();
    const sessionId = options?.sessionId;
    const { code, executionSettings } = submission;
    const stdin = executionSettings?.stdin;
    const randomSeed = executionSettings?.randomSeed;
    const attachedFiles = executionSettings?.attachedFiles;

    if (!sessionId) {
      return {
        success: false,
        output: '',
        error: 'Session ID is required for Vercel Sandbox execution',
        executionTime: 0,
        stdin,
      };
    }

    try {
      const sandbox = await this.getSandbox(sessionId);

      // Prepare code with random seed injection if needed
      let executionCode = code;
      if (randomSeed !== undefined) {
        const seedInjection = `import random\nrandom.seed(${randomSeed})\n`;
        executionCode = seedInjection + code;
      }

      // Build files to write
      const filesToWrite: Array<{ path: string; content: Buffer }> = [
        { path: 'main.py', content: Buffer.from(executionCode) },
      ];

      // Add stdin file if provided
      if (stdin !== undefined && stdin !== null) {
        filesToWrite.push({ path: '/tmp/stdin.txt', content: Buffer.from(stdin) });
      }

      // Add attached files
      if (attachedFiles && attachedFiles.length > 0) {
        for (const file of attachedFiles) {
          const sanitizedName = sanitizeFilename(file.name);
          filesToWrite.push({ path: sanitizedName, content: Buffer.from(file.content) });
        }
      }

      // Write all files
      await sandbox.writeFiles(filesToWrite);

      // Execute with timeout using AbortController
      const controller = new AbortController();
      const timeout = options?.timeout ?? EXECUTION_TIMEOUT_MS;
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        // Vercel Sandbox runCommand doesn't support stdin piping, so when
        // stdin is provided we use shell redirection from the stdin file.
        const hasStdin = stdin !== undefined && stdin !== null;
        const result = await sandbox.runCommand({
          cmd: hasStdin ? 'bash' : 'python3',
          args: hasStdin
            ? ['-c', 'python3 main.py < /tmp/stdin.txt']
            : ['main.py'],
          cwd: SANDBOX_CWD,
          signal: controller.signal,
        });

        const stdout = await result.stdout();
        const stderr = await result.stderr();
        const executionTime = Date.now() - startTime;
        const success = result.exitCode === 0 && stderr.length === 0;

        logSandboxEvent({
          event: 'sandbox_execute',
          sessionId,
          durationMs: executionTime,
          success,
          metadata: {
            exitCode: result.exitCode,
            hasStderr: stderr.length > 0,
            codeLength: code.length,
          },
        });

        return {
          success,
          output: truncateOutput(stdout),
          error: truncateOutput(stderr),
          executionTime,
          stdin,
        };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      const executionTime = Date.now() - startTime;

      // Handle abort/timeout
      if (error instanceof Error && error.name === 'AbortError') {
        logSandboxEvent({
          event: 'sandbox_execute',
          sessionId,
          durationMs: executionTime,
          success: false,
          error: 'Execution timed out',
          errorCode: 'TIMEOUT',
          metadata: { codeLength: code.length },
        });
        return {
          success: false,
          output: '',
          error: `Execution timed out after ${options?.timeout ?? EXECUTION_TIMEOUT_MS}ms`,
          executionTime,
          stdin,
        };
      }

      // Handle sandbox errors
      if (error instanceof SandboxError) {
        logSandboxEvent({
          event: 'sandbox_execute',
          sessionId,
          durationMs: executionTime,
          success: false,
          error: error.message,
          errorCode: error.code,
          metadata: { codeLength: code.length },
        });
        return {
          success: false,
          output: '',
          error: `Code execution temporarily unavailable: ${error.message}`,
          executionTime,
          stdin,
        };
      }

      logSandboxEvent({
        event: 'sandbox_execute',
        sessionId,
        durationMs: executionTime,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        metadata: { codeLength: code.length },
      });

      return {
        success: false,
        output: '',
        error: `Failed to execute code: ${error instanceof Error ? error.message : 'Unknown error'}`,
        executionTime,
        stdin,
      };
    }
  }

  /**
   * Trace code execution on Vercel Sandbox
   *
   * @param code - Python code to trace
   * @param options - Trace options
   * @returns Execution trace
   */
  async trace(code: string, options?: TraceOptions): Promise<ExecutionTrace> {
    const startTime = Date.now();
    const sessionId = options?.sessionId;
    const stdin = options?.executionSettings?.stdin ?? '';
    const randomSeed = options?.executionSettings?.randomSeed;
    const attachedFiles = options?.executionSettings?.attachedFiles;
    const maxSteps = options?.maxSteps ?? DEFAULT_MAX_STEPS;

    if (!sessionId) {
      return {
        steps: [],
        totalSteps: 0,
        exitCode: 1,
        error: 'Session ID is required for Vercel Sandbox tracing',
        truncated: false,
      };
    }

    try {
      const sandbox = await this.getSandbox(sessionId);

      // Inject random seed if provided
      let executionCode = code;
      if (randomSeed !== undefined) {
        const seedInjection = `import random\nrandom.seed(${randomSeed})\n`;
        executionCode = seedInjection + code;
      }

      // Write tracer script and attached files to sandbox
      const filesToWrite: Array<{ path: string; content: Buffer }> = [
        { path: TRACER_PATH, content: Buffer.from(TRACER_SCRIPT) },
      ];

      // Add attached files
      if (attachedFiles && attachedFiles.length > 0) {
        for (const file of attachedFiles) {
          const sanitizedName = sanitizeFilename(file.name);
          filesToWrite.push({ path: sanitizedName, content: Buffer.from(file.content) });
        }
      }

      await sandbox.writeFiles(filesToWrite);

      // Execute tracer with timeout using AbortController
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), EXECUTION_TIMEOUT_MS);

      try {
        const result = await sandbox.runCommand({
          cmd: 'python3',
          args: [TRACER_PATH, executionCode, stdin, maxSteps.toString()],
          cwd: SANDBOX_CWD,
          signal: controller.signal,
        });

        const stdout = await result.stdout();
        const stderr = await result.stderr();
        const durationMs = Date.now() - startTime;

        // Parse JSON output from tracer
        try {
          const trace: ExecutionTrace = JSON.parse(stdout);

          logSandboxEvent({
            event: 'sandbox_trace',
            sessionId,
            durationMs,
            success: !trace.error,
            metadata: {
              totalSteps: trace.totalSteps,
              truncated: trace.truncated,
              codeLength: code.length,
              hasStderr: !!stderr,
            },
          });

          return trace;
        } catch {
          logSandboxEvent({
            event: 'sandbox_trace',
            sessionId,
            durationMs,
            success: false,
            error: 'Failed to parse trace output',
            metadata: { codeLength: code.length },
          });
          return {
            steps: [],
            totalSteps: 0,
            exitCode: 1,
            error: stderr || 'Failed to parse trace output',
            truncated: false,
          };
        }
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      const durationMs = Date.now() - startTime;

      // Handle abort/timeout
      if (error instanceof Error && error.name === 'AbortError') {
        logSandboxEvent({
          event: 'sandbox_trace',
          sessionId,
          durationMs,
          success: false,
          error: 'Trace execution timed out',
          errorCode: 'TIMEOUT',
          metadata: { codeLength: code.length },
        });
        return {
          steps: [],
          totalSteps: 0,
          exitCode: 1,
          error: `Trace execution timed out after ${EXECUTION_TIMEOUT_MS}ms`,
          truncated: false,
        };
      }

      // Handle sandbox errors
      if (error instanceof SandboxError) {
        logSandboxEvent({
          event: 'sandbox_trace',
          sessionId,
          durationMs,
          success: false,
          error: error.message,
          errorCode: error.code,
          metadata: { codeLength: code.length },
        });
        return {
          steps: [],
          totalSteps: 0,
          exitCode: 1,
          error: `Code tracing temporarily unavailable: ${error.message}`,
          truncated: false,
        };
      }

      logSandboxEvent({
        event: 'sandbox_trace',
        sessionId,
        durationMs,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        metadata: { codeLength: code.length },
      });

      return {
        steps: [],
        totalSteps: 0,
        exitCode: 1,
        error: `Failed to trace code: ${error instanceof Error ? error.message : 'Unknown error'}`,
        truncated: false,
      };
    }
  }

  /**
   * Get backend status
   *
   * Available when running on Vercel with sandbox enabled.
   */
  async getStatus(): Promise<BackendStatus> {
    const isVercel = process.env.VERCEL === '1';
    const isSandboxEnabled = process.env.VERCEL_SANDBOX_ENABLED === '1';

    if (!isVercel) {
      return {
        available: false,
        healthy: false,
        message: 'Not running on Vercel',
        metadata: { isVercel, isSandboxEnabled },
      };
    }

    if (!isSandboxEnabled) {
      return {
        available: false,
        healthy: false,
        message: 'Vercel Sandbox is not enabled',
        metadata: { isVercel, isSandboxEnabled },
      };
    }

    return {
      available: true,
      healthy: true,
      message: 'Vercel Sandbox is available',
      metadata: { isVercel, isSandboxEnabled },
    };
  }

  /**
   * Get or recreate a sandbox for a session
   *
   * Fetches sandbox_id from state and reconnects. If the sandbox
   * has timed out or failed, creates a new one.
   *
   * @param sessionId - Session ID to get sandbox for
   * @returns Active Sandbox instance
   */
  private async getSandbox(sessionId: string): Promise<Sandbox> {
    const startTime = Date.now();

    // Fetch sandbox ID from state repository
    const state = await this.stateRepository.getState(sessionId);

    if (!state || !state.sandboxId) {
      logSandboxEvent({
        event: 'sandbox_reconnect',
        sessionId,
        durationMs: Date.now() - startTime,
        success: false,
        error: 'No sandbox found for session',
        errorCode: 'UNAVAILABLE',
      });
      throw new SandboxError(
        'No sandbox found for session',
        'UNAVAILABLE',
        sessionId
      );
    }

    const sandboxId = state.sandboxId as string;

    try {
      // Reconnect to sandbox
      const sandbox = await Sandbox.get({ sandboxId });

      // Check if sandbox is still running
      if (sandbox.status === 'running') {
        logSandboxEvent({
          event: 'sandbox_reconnect',
          sessionId,
          sandboxId,
          durationMs: Date.now() - startTime,
          success: true,
        });
        return sandbox;
      }

      // Sandbox has timed out or failed - recreate
      logSandboxEvent({
        event: 'sandbox_reconnect',
        sessionId,
        sandboxId,
        durationMs: Date.now() - startTime,
        success: false,
        error: `Sandbox status is ${sandbox.status}`,
        metadata: { status: sandbox.status, needsRecreate: true },
      });
      return await this.recreateSandbox(sessionId, sandboxId);
    } catch (error) {
      // Sandbox may not exist anymore - try to recreate
      logSandboxEvent({
        event: 'sandbox_reconnect',
        sessionId,
        sandboxId,
        durationMs: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        metadata: { needsRecreate: true },
      });
      return await this.recreateSandbox(sessionId, sandboxId);
    }
  }

  /**
   * Recreate a sandbox for a session
   *
   * Creates a new sandbox and updates the state via repository.
   * Uses optimistic locking to handle race conditions.
   *
   * @param sessionId - Session ID
   * @param oldSandboxId - Previous sandbox ID (for optimistic locking)
   * @returns New Sandbox instance
   */
  private async recreateSandbox(sessionId: string, oldSandboxId: string): Promise<Sandbox> {
    const startTime = Date.now();

    try {
      const newSandbox = await Sandbox.create({
        runtime: 'python3.13',
        timeout: SESSION_TIMEOUT_MS,
      });

      // Update state with new sandbox ID
      // Note: This implementation doesn't have true optimistic locking like the original
      // If race conditions become an issue, the state repository interface could be extended
      await this.stateRepository.saveState(sessionId, { sandboxId: newSandbox.sandboxId });

      logSandboxEvent({
        event: 'sandbox_recreate',
        sessionId,
        sandboxId: newSandbox.sandboxId,
        durationMs: Date.now() - startTime,
        success: true,
        metadata: { oldSandboxId },
      });

      return newSandbox;
    } catch (error) {
      logSandboxEvent({
        event: 'sandbox_recreate',
        sessionId,
        durationMs: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorCode: error instanceof SandboxError ? error.code : undefined,
        metadata: { oldSandboxId },
      });

      if (error instanceof SandboxError) {
        throw error;
      }
      throw new SandboxError(
        `Failed to recreate sandbox: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'RECONNECTION_FAILED',
        sessionId,
        error instanceof Error ? error : undefined
      );
    }
  }
}
