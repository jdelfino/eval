/**
 * Tests for ExecutorService
 *
 * Tests the high-level orchestration of code execution across backends.
 */

import {
  ExecutorService,
  getExecutorService,
  resetExecutorService,
} from '../executor-service';
import { getBackendRegistry, BackendRegistration } from '../registry';
import {
  IBackendStateRepository,
  ICodeExecutionBackend,
  ISessionScopedBackend,
  BackendCapabilities,
  CodeSubmission,
  ExecutionResult,
  ExecutionTrace,
  BackendStatus,
} from '../interfaces';

// Mock the sanitizeError function
jest.mock('../utils', () => ({
  ...jest.requireActual('../utils'),
  sanitizeError: jest.fn((error: string) => `[sanitized] ${error}`),
}));

import { sanitizeError } from '../utils';

/**
 * Create a mock IBackendStateRepository
 */
function createMockStateRepository(): jest.Mocked<IBackendStateRepository> {
  return {
    assignBackend: jest.fn().mockResolvedValue(undefined),
    getAssignedBackend: jest.fn().mockResolvedValue(null),
    saveState: jest.fn().mockResolvedValue(undefined),
    getState: jest.fn().mockResolvedValue(null),
    deleteState: jest.fn().mockResolvedValue(undefined),
    hasState: jest.fn().mockResolvedValue(false),
  };
}

/**
 * Create a mock stateless backend
 */
function createMockBackend(
  type: string,
  options: {
    capabilities?: Partial<BackendCapabilities>;
    executeResult?: ExecutionResult;
    traceResult?: ExecutionTrace;
  } = {}
): jest.Mocked<ICodeExecutionBackend> {
  const capabilities: BackendCapabilities = {
    execute: true,
    trace: false,
    attachedFiles: false,
    stdin: false,
    randomSeed: false,
    stateful: false,
    requiresWarmup: false,
    ...options.capabilities,
  };

  const executeResult = options.executeResult ?? {
    success: true,
    output: `Output from ${type}`,
    error: '',
    executionTime: 100,
  };

  const traceResult = options.traceResult ?? {
    steps: [],
    totalSteps: 0,
    exitCode: 0,
    truncated: false,
  };

  const backend: jest.Mocked<ICodeExecutionBackend> = {
    backendType: type,
    capabilities,
    execute: jest.fn().mockResolvedValue(executeResult),
    getStatus: jest.fn().mockResolvedValue({ available: true, healthy: true }),
  };

  if (capabilities.trace) {
    backend.trace = jest.fn().mockResolvedValue(traceResult);
  }

  return backend;
}

/**
 * Create a mock session-scoped backend
 */
function createMockSessionScopedBackend(
  type: string,
  options: {
    executeResult?: ExecutionResult;
    traceResult?: ExecutionTrace;
  } = {}
): jest.Mocked<ISessionScopedBackend> {
  const backend = createMockBackend(type, {
    capabilities: {
      execute: true,
      trace: true,
      attachedFiles: true,
      stdin: true,
      randomSeed: true,
      stateful: true,
      requiresWarmup: true,
    },
    ...options,
  }) as jest.Mocked<ISessionScopedBackend>;

  backend.warmup = jest.fn().mockResolvedValue('sandbox-id');
  backend.isReady = jest.fn().mockResolvedValue(true);
  backend.cleanup = jest.fn().mockResolvedValue(undefined);
  backend.trace = jest.fn().mockResolvedValue(
    options.traceResult ?? {
      steps: [],
      totalSteps: 0,
      exitCode: 0,
      truncated: false,
    }
  );

  return backend;
}

/**
 * Create a mock backend registration
 */
function createMockRegistration(
  backend: ICodeExecutionBackend,
  options: { isAvailable?: boolean } = {}
): BackendRegistration {
  const { isAvailable = true } = options;

  return {
    type: backend.backendType,
    factory: () => backend,
    isAvailable: () => isAvailable,
    capabilities: backend.capabilities,
  };
}

describe('ExecutorService', () => {
  let service: ExecutorService;
  let mockStateRepository: jest.Mocked<IBackendStateRepository>;
  let registry = getBackendRegistry();

  beforeEach(() => {
    jest.clearAllMocks();
    registry.reset();
    mockStateRepository = createMockStateRepository();
    service = new ExecutorService(mockStateRepository);
  });

  afterEach(() => {
    registry.reset();
    resetExecutorService();
  });

  describe('executeCode', () => {
    it('should return error when no backend available', async () => {
      // Registry is empty, no backends registered
      const result = await service.executeCode({ code: 'print("hello")' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('No backend available');
      expect(result.executionTime).toBe(0);
    });

    it('should execute code using selected backend', async () => {
      const mockBackend = createMockBackend('test-backend');
      registry.register(createMockRegistration(mockBackend));

      const submission: CodeSubmission = { code: 'print("hello")' };
      const result = await service.executeCode(submission, 5000);

      expect(result.success).toBe(true);
      expect(result.output).toBe('Output from test-backend');
      expect(mockBackend.execute).toHaveBeenCalledWith(submission, {
        timeout: 5000,
        sessionId: undefined,
      });
    });

    it('should look up assigned backend when sessionId provided', async () => {
      const mockBackend = createMockBackend('assigned-backend');
      registry.register(createMockRegistration(mockBackend));
      mockStateRepository.getAssignedBackend.mockResolvedValue('assigned-backend');

      const submission: CodeSubmission = { code: 'print("hello")' };
      await service.executeCode(submission, undefined, 'session-123');

      expect(mockStateRepository.getAssignedBackend).toHaveBeenCalledWith('session-123');
      expect(mockBackend.execute).toHaveBeenCalledWith(submission, {
        timeout: undefined,
        sessionId: 'session-123',
      });
    });

    it('should fall back to registry.select() when session has no assigned backend', async () => {
      const mockBackend = createMockBackend('fallback-backend');
      registry.register(createMockRegistration(mockBackend));
      mockStateRepository.getAssignedBackend.mockResolvedValue(null);

      await service.executeCode({ code: 'x = 1' }, undefined, 'session-123');

      expect(mockBackend.execute).toHaveBeenCalled();
    });

    it('should sanitize errors on failed execution', async () => {
      const mockBackend = createMockBackend('error-backend', {
        executeResult: {
          success: false,
          output: '',
          error: 'File "/path/to/file.py", line 1\nSyntaxError: invalid syntax',
          executionTime: 50,
        },
      });
      registry.register(createMockRegistration(mockBackend));

      const result = await service.executeCode({ code: 'print(' });

      expect(result.success).toBe(false);
      expect(sanitizeError).toHaveBeenCalledWith(
        'File "/path/to/file.py", line 1\nSyntaxError: invalid syntax'
      );
      expect(result.error).toBe(
        '[sanitized] File "/path/to/file.py", line 1\nSyntaxError: invalid syntax'
      );
    });

    it('should not sanitize errors on successful execution', async () => {
      const mockBackend = createMockBackend('success-backend', {
        executeResult: {
          success: true,
          output: 'hello',
          error: '',
          executionTime: 50,
        },
      });
      registry.register(createMockRegistration(mockBackend));

      await service.executeCode({ code: 'print("hello")' });

      // sanitizeError should not be called when error is empty
      expect(sanitizeError).not.toHaveBeenCalled();
    });
  });

  describe('traceExecution', () => {
    it('should return error when no backend available', async () => {
      const result = await service.traceExecution('x = 1');

      expect(result.exitCode).toBe(1);
      expect(result.error).toBe('Tracing not available');
      expect(result.steps).toEqual([]);
    });

    it('should return error when backend does not support trace', async () => {
      const mockBackend = createMockBackend('no-trace-backend', {
        capabilities: { trace: false },
      });
      registry.register(createMockRegistration(mockBackend));

      const result = await service.traceExecution('x = 1');

      expect(result.exitCode).toBe(1);
      expect(result.error).toBe('Tracing not available');
    });

    it('should trace code using backend with trace capability', async () => {
      const mockBackend = createMockBackend('trace-backend', {
        capabilities: { trace: true },
        traceResult: {
          steps: [{ line: 1, event: 'line', locals: {}, globals: {}, callStack: [], stdout: '' }],
          totalSteps: 1,
          exitCode: 0,
          truncated: false,
        },
      });
      registry.register(createMockRegistration(mockBackend));

      const result = await service.traceExecution('x = 1', {
        executionSettings: { stdin: 'input' },
        maxSteps: 100,
      });

      expect(result.exitCode).toBe(0);
      expect(result.totalSteps).toBe(1);
      expect(mockBackend.trace).toHaveBeenCalledWith('x = 1', {
        executionSettings: { stdin: 'input' },
        maxSteps: 100,
      });
    });

    it('should pass sessionId to trace', async () => {
      const mockBackend = createMockBackend('trace-backend', {
        capabilities: { trace: true },
      });
      registry.register(createMockRegistration(mockBackend));
      mockStateRepository.getAssignedBackend.mockResolvedValue('trace-backend');

      await service.traceExecution('x = 1', { sessionId: 'session-123' });

      expect(mockBackend.trace).toHaveBeenCalledWith('x = 1', {
        sessionId: 'session-123',
      });
    });
  });

  describe('prepareForSession', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should assign backend and call warmup for session-scoped backends', async () => {
      const mockBackend = createMockSessionScopedBackend('vercel-sandbox');
      registry.register(createMockRegistration(mockBackend));

      // Simulate Vercel environment with sandbox enabled
      process.env.VERCEL = '1';
      process.env.VERCEL_SANDBOX_ENABLED = '1';

      await service.prepareForSession('session-123');

      expect(mockStateRepository.assignBackend).toHaveBeenCalledWith(
        'session-123',
        'vercel-sandbox'
      );
      expect(mockBackend.warmup).toHaveBeenCalledWith('session-123');
    });

    it('should assign local-python backend in development', async () => {
      const mockBackend = createMockBackend('local-python');
      registry.register(createMockRegistration(mockBackend));

      // Clear Vercel env vars
      delete process.env.VERCEL;
      delete process.env.VERCEL_SANDBOX_ENABLED;

      await service.prepareForSession('session-123');

      expect(mockStateRepository.assignBackend).toHaveBeenCalledWith(
        'session-123',
        'local-python'
      );
    });

    it('should assign disabled backend on Vercel without sandbox', async () => {
      const mockBackend = createMockBackend('disabled');
      registry.register(createMockRegistration(mockBackend));

      process.env.VERCEL = '1';
      delete process.env.VERCEL_SANDBOX_ENABLED;

      await service.prepareForSession('session-123');

      expect(mockStateRepository.assignBackend).toHaveBeenCalledWith(
        'session-123',
        'disabled'
      );
    });

    it('should not call warmup for stateless backends', async () => {
      const mockBackend = createMockBackend('local-python', {
        capabilities: { stateful: false },
      });
      registry.register(createMockRegistration(mockBackend));

      delete process.env.VERCEL;

      await service.prepareForSession('session-123');

      expect(mockStateRepository.assignBackend).toHaveBeenCalled();
      // No warmup method on stateless backends
    });
  });

  describe('cleanupSession', () => {
    it('should call cleanup on session-scoped backends', async () => {
      const mockBackend = createMockSessionScopedBackend('vercel-sandbox');
      registry.register(createMockRegistration(mockBackend));
      mockStateRepository.getAssignedBackend.mockResolvedValue('vercel-sandbox');

      await service.cleanupSession('session-123');

      expect(mockStateRepository.getAssignedBackend).toHaveBeenCalledWith('session-123');
      expect(mockBackend.cleanup).toHaveBeenCalledWith('session-123');
    });

    it('should not call cleanup on stateless backends', async () => {
      const mockBackend = createMockBackend('local-python', {
        capabilities: { stateful: false },
      });
      registry.register(createMockRegistration(mockBackend));
      mockStateRepository.getAssignedBackend.mockResolvedValue('local-python');

      await service.cleanupSession('session-123');

      // Cleanup is not called because backend is stateless
      expect(mockStateRepository.getAssignedBackend).toHaveBeenCalled();
    });

    it('should handle no backend gracefully', async () => {
      mockStateRepository.getAssignedBackend.mockResolvedValue(null);

      // Should not throw
      await expect(service.cleanupSession('session-123')).resolves.not.toThrow();
    });
  });

  describe('backend selection fallback', () => {
    it('should use registry.select() when no sessionId provided', async () => {
      // Register backends - vercel-sandbox comes first in selection order
      const vercelBackend = createMockBackend('vercel-sandbox');
      const localBackend = createMockBackend('local-python');

      registry.register(createMockRegistration(vercelBackend));
      registry.register(createMockRegistration(localBackend));

      await service.executeCode({ code: 'x = 1' });

      // Should use vercel-sandbox (first in selection order)
      expect(vercelBackend.execute).toHaveBeenCalled();
      expect(localBackend.execute).not.toHaveBeenCalled();
    });

    it('should fall back to registry.select() when assigned backend not found', async () => {
      const availableBackend = createMockBackend('available');
      registry.register(createMockRegistration(availableBackend));

      // Session has assigned backend that doesn't exist in registry
      mockStateRepository.getAssignedBackend.mockResolvedValue('non-existent');

      await service.executeCode({ code: 'x = 1' }, undefined, 'session-123');

      expect(availableBackend.execute).toHaveBeenCalled();
    });
  });
});

describe('getExecutorService', () => {
  beforeEach(() => {
    resetExecutorService();
  });

  afterEach(() => {
    resetExecutorService();
  });

  it('should return the same instance on multiple calls', () => {
    const instance1 = getExecutorService();
    const instance2 = getExecutorService();

    expect(instance1).toBe(instance2);
  });

  it('should return a new instance after reset', () => {
    const instance1 = getExecutorService();
    resetExecutorService();
    const instance2 = getExecutorService();

    expect(instance1).not.toBe(instance2);
  });
});

describe('resetExecutorService', () => {
  it('should allow dependency injection for testing', () => {
    // Get default instance
    const defaultInstance = getExecutorService();

    // Reset and create custom instance
    resetExecutorService();
    const customStateRepo = createMockStateRepository();
    const customService = new ExecutorService(customStateRepo);

    // Verify they are different
    expect(customService).not.toBe(defaultInstance);

    // Custom service should use the custom state repository
    expect(customStateRepo.getAssignedBackend).not.toHaveBeenCalled();
  });
});
