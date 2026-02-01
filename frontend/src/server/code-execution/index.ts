/**
 * Code Execution Module
 *
 * This module provides a pluggable code execution abstraction layer.
 * It supports multiple backends (local Python, Vercel Sandbox, disabled)
 * with automatic selection based on environment and capabilities.
 *
 * Usage:
 *   import { getExecutorService } from '@/server/code-execution';
 *   const result = await getExecutorService().executeCode({ code: 'print("hello")' });
 *
 * Backend selection order (first available wins):
 *   1. vercel-sandbox - production on Vercel
 *   2. local-python - local development
 *   3. disabled - fallback when no execution available
 */

import { getBackendRegistry } from './registry';
import { LocalPythonBackend } from './backends/local-python-backend';
import { VercelSandboxBackend } from './backends/vercel-sandbox-backend';
import { DisabledBackend } from './backends/disabled-backend';
import { SupabaseBackendStateRepository } from './supabase-state-repository';

// Register all backends on module load
const registry = getBackendRegistry();

// Only register if not already registered (prevents double-registration on hot reload)
if (registry.list().length === 0) {
  // Vercel Sandbox - production backend
  registry.register({
    type: 'vercel-sandbox',
    factory: () => new VercelSandboxBackend(new SupabaseBackendStateRepository()),
    isAvailable: () =>
      process.env.VERCEL === '1' && process.env.VERCEL_SANDBOX_ENABLED === '1',
    capabilities: {
      execute: true,
      trace: true,
      attachedFiles: true,
      stdin: true,
      randomSeed: true,
      stateful: true,
      requiresWarmup: true,
    },
  });

  // Local Python - development backend
  registry.register({
    type: 'local-python',
    factory: () => new LocalPythonBackend(),
    isAvailable: () => !process.env.VERCEL,
    capabilities: {
      execute: true,
      trace: true,
      attachedFiles: true,
      stdin: true,
      randomSeed: true,
      stateful: false,
      requiresWarmup: false,
    },
  });

  // Disabled - fallback when no execution available
  registry.register({
    type: 'disabled',
    factory: () => new DisabledBackend(),
    isAvailable: () => true, // Always available as fallback
    capabilities: {
      execute: false,
      trace: false,
      attachedFiles: false,
      stdin: false,
      randomSeed: false,
      stateful: false,
      requiresWarmup: false,
    },
  });
}

// Re-export everything
export { ExecutorService, getExecutorService, resetExecutorService } from './executor-service';
export { BackendRegistry, getBackendRegistry } from './registry';
export type { BackendRegistration, BackendSelector } from './registry';
export { SupabaseBackendStateRepository } from './supabase-state-repository';
export type {
  ICodeExecutionBackend,
  ISessionScopedBackend,
  IBackendStateRepository,
  BackendCapabilities,
  BackendStatus,
  ExecuteOptions,
  TraceOptions,
  CodeSubmission,
  ExecutionResult,
  ExecutionTrace,
} from './interfaces';
export { LocalPythonBackend, VercelSandboxBackend, SandboxError, DisabledBackend } from './backends';
export {
  DEFAULT_TIMEOUT,
  MAX_FILE_SIZE,
  MAX_FILES,
  validateAttachedFiles,
  sanitizeFilename,
  sanitizeError,
} from './utils';
