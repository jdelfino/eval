/**
 * Tests for code-execution interfaces
 *
 * These tests verify that all interfaces and types are properly exported
 * and can be used to implement backends.
 */

import {
  BackendCapabilities,
  BackendStatus,
  ExecuteOptions,
  TraceOptions,
  ICodeExecutionBackend,
  ISessionScopedBackend,
  IBackendStateRepository,
  CodeSubmission,
  ExecutionResult,
  ExecutionTrace,
} from '../interfaces';

describe('code-execution interfaces', () => {
  describe('BackendCapabilities', () => {
    it('can be constructed with all required fields', () => {
      const capabilities: BackendCapabilities = {
        execute: true,
        trace: true,
        attachedFiles: true,
        stdin: true,
        randomSeed: true,
        stateful: false,
        requiresWarmup: false,
      };

      expect(capabilities.execute).toBe(true);
      expect(capabilities.stateful).toBe(false);
    });
  });

  describe('BackendStatus', () => {
    it('can be constructed with required fields only', () => {
      const status: BackendStatus = {
        available: true,
        healthy: true,
      };

      expect(status.available).toBe(true);
      expect(status.message).toBeUndefined();
    });

    it('can include optional fields', () => {
      const status: BackendStatus = {
        available: false,
        healthy: false,
        message: 'Backend unavailable',
        metadata: { reason: 'maintenance' },
      };

      expect(status.message).toBe('Backend unavailable');
      expect(status.metadata?.reason).toBe('maintenance');
    });
  });

  describe('ExecuteOptions', () => {
    it('can be empty', () => {
      const options: ExecuteOptions = {};
      expect(options.timeout).toBeUndefined();
    });

    it('can include timeout and sessionId', () => {
      const options: ExecuteOptions = {
        timeout: 5000,
        sessionId: 'session-123',
      };

      expect(options.timeout).toBe(5000);
      expect(options.sessionId).toBe('session-123');
    });
  });

  describe('TraceOptions', () => {
    it('can be empty', () => {
      const options: TraceOptions = {};
      expect(options.executionSettings).toBeUndefined();
    });

    it('can include all fields', () => {
      const options: TraceOptions = {
        executionSettings: { stdin: 'test input' },
        maxSteps: 1000,
        sessionId: 'session-456',
      };

      expect(options.executionSettings?.stdin).toBe('test input');
      expect(options.maxSteps).toBe(1000);
    });
  });

  describe('ICodeExecutionBackend', () => {
    it('can be implemented with execute only', async () => {
      const backend: ICodeExecutionBackend = {
        backendType: 'test-backend',
        capabilities: {
          execute: true,
          trace: false,
          attachedFiles: false,
          stdin: false,
          randomSeed: false,
          stateful: false,
          requiresWarmup: false,
        },
        async execute(submission: CodeSubmission): Promise<ExecutionResult> {
          return {
            success: true,
            output: 'Hello',
            error: '',
            executionTime: 100,
          };
        },
        async getStatus(): Promise<BackendStatus> {
          return { available: true, healthy: true };
        },
      };

      expect(backend.backendType).toBe('test-backend');
      expect(backend.capabilities.execute).toBe(true);
      expect(backend.trace).toBeUndefined();

      const result = await backend.execute({ code: 'print("Hello")' });
      expect(result.success).toBe(true);
    });

    it('can be implemented with trace support', async () => {
      const backend: ICodeExecutionBackend = {
        backendType: 'test-backend-with-trace',
        capabilities: {
          execute: true,
          trace: true,
          attachedFiles: true,
          stdin: true,
          randomSeed: true,
          stateful: false,
          requiresWarmup: false,
        },
        async execute(): Promise<ExecutionResult> {
          return { success: true, output: '', error: '', executionTime: 0 };
        },
        async trace(code: string): Promise<ExecutionTrace> {
          return {
            steps: [],
            totalSteps: 0,
            exitCode: 0,
          };
        },
        async getStatus(): Promise<BackendStatus> {
          return { available: true, healthy: true };
        },
      };

      expect(backend.trace).toBeDefined();
      const trace = await backend.trace!('x = 1');
      expect(trace.exitCode).toBe(0);
    });
  });

  describe('ISessionScopedBackend', () => {
    it('extends ICodeExecutionBackend with lifecycle methods', async () => {
      const warmedUpSessions = new Set<string>();

      const backend: ISessionScopedBackend = {
        backendType: 'session-scoped-test',
        capabilities: {
          execute: true,
          trace: true,
          attachedFiles: true,
          stdin: true,
          randomSeed: true,
          stateful: true,
          requiresWarmup: true,
        },
        async execute(): Promise<ExecutionResult> {
          return { success: true, output: '', error: '', executionTime: 0 };
        },
        async trace(): Promise<ExecutionTrace> {
          return { steps: [], totalSteps: 0, exitCode: 0 };
        },
        async getStatus(): Promise<BackendStatus> {
          return { available: true, healthy: true };
        },
        async warmup(sessionId: string): Promise<string | null> {
          warmedUpSessions.add(sessionId);
          return `sandbox-${sessionId}`;
        },
        async isReady(sessionId: string): Promise<boolean> {
          return warmedUpSessions.has(sessionId);
        },
        async cleanup(sessionId: string): Promise<void> {
          warmedUpSessions.delete(sessionId);
        },
      };

      expect(backend.capabilities.stateful).toBe(true);

      // Test lifecycle
      expect(await backend.isReady('session-1')).toBe(false);
      const sandboxId = await backend.warmup('session-1');
      expect(sandboxId).toBe('sandbox-session-1');
      expect(await backend.isReady('session-1')).toBe(true);
      await backend.cleanup('session-1');
      expect(await backend.isReady('session-1')).toBe(false);
    });
  });

  describe('IBackendStateRepository', () => {
    it('can be implemented with in-memory storage', async () => {
      const assignments = new Map<string, string>();
      const states = new Map<string, Record<string, unknown>>();

      const repo: IBackendStateRepository = {
        async assignBackend(sessionId, backendType) {
          assignments.set(sessionId, backendType);
        },
        async getAssignedBackend(sessionId) {
          return assignments.get(sessionId) ?? null;
        },
        async saveState(sessionId, state) {
          states.set(sessionId, state);
        },
        async getState(sessionId) {
          return states.get(sessionId) ?? null;
        },
        async deleteState(sessionId) {
          states.delete(sessionId);
        },
        async hasState(sessionId) {
          return states.has(sessionId);
        },
      };

      // Test backend assignment
      expect(await repo.getAssignedBackend('session-1')).toBeNull();
      await repo.assignBackend('session-1', 'vercel-sandbox');
      expect(await repo.getAssignedBackend('session-1')).toBe('vercel-sandbox');

      // Test state persistence
      expect(await repo.hasState('session-1')).toBe(false);
      await repo.saveState('session-1', { sandboxId: 'sb-123' });
      expect(await repo.hasState('session-1')).toBe(true);
      expect(await repo.getState('session-1')).toEqual({ sandboxId: 'sb-123' });

      // Test cleanup
      await repo.deleteState('session-1');
      expect(await repo.hasState('session-1')).toBe(false);
    });
  });

  describe('re-exported types', () => {
    it('exports CodeSubmission from ../types', () => {
      const submission: CodeSubmission = {
        code: 'print("hello")',
        executionSettings: { stdin: 'input' },
      };
      expect(submission.code).toBe('print("hello")');
    });

    it('exports ExecutionResult from ../types', () => {
      const result: ExecutionResult = {
        success: true,
        output: 'hello',
        error: '',
        executionTime: 50,
        stdin: 'input',
      };
      expect(result.success).toBe(true);
    });

    it('exports ExecutionTrace from ../types', () => {
      const trace: ExecutionTrace = {
        steps: [],
        totalSteps: 0,
        exitCode: 0,
        error: undefined,
        truncated: false,
      };
      expect(trace.exitCode).toBe(0);
    });
  });
});
