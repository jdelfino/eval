import {
  VercelSandboxBackend,
  SandboxError,
} from '../../backends/vercel-sandbox-backend';
import { IBackendStateRepository, CodeSubmission } from '../../interfaces';

// Mock @vercel/sandbox
jest.mock('@vercel/sandbox', () => ({
  Sandbox: {
    create: jest.fn(),
    get: jest.fn(),
  },
}));

// Get the mocked module
import { Sandbox } from '@vercel/sandbox';

const mockSandboxCreate = Sandbox.create as jest.Mock;
const mockSandboxGet = Sandbox.get as jest.Mock;

// Mock logger to avoid console output during tests
jest.mock('../../logger', () => ({
  logSandboxEvent: jest.fn(),
}));

// Mock tracer script
jest.mock('../../backends/tracer-script', () => ({
  TRACER_SCRIPT: '# mock tracer script',
  TRACER_PATH: '/tmp/tracer.py',
}));

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
 * Create a mock Sandbox instance
 */
function createMockSandbox(
  sandboxId: string = 'mock-sandbox-id',
  status: 'running' | 'stopped' = 'running'
) {
  return {
    sandboxId,
    status,
    stop: jest.fn().mockResolvedValue(undefined),
    writeFiles: jest.fn().mockResolvedValue(undefined),
    runCommand: jest.fn().mockResolvedValue({
      exitCode: 0,
      stdout: jest.fn().mockResolvedValue(''),
      stderr: jest.fn().mockResolvedValue(''),
    }),
  };
}

describe('VercelSandboxBackend', () => {
  let backend: VercelSandboxBackend;
  let mockStateRepository: jest.Mocked<IBackendStateRepository>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStateRepository = createMockStateRepository();
    backend = new VercelSandboxBackend(mockStateRepository);
  });

  describe('warmup()', () => {
    it('should create sandbox and save state', async () => {
      const mockSandbox = createMockSandbox('new-sandbox-id');
      mockSandboxCreate.mockResolvedValue(mockSandbox);

      const sessionId = 'session-123';
      const result = await backend.warmup(sessionId);

      expect(result).toBe('new-sandbox-id');
      expect(mockSandboxCreate).toHaveBeenCalledWith({
        runtime: 'python3.13',
        timeout: 45 * 60 * 1000,
      });
      expect(mockStateRepository.saveState).toHaveBeenCalledWith(sessionId, {
        sandboxId: 'new-sandbox-id',
      });
    });

    it('should throw SandboxError on creation failure', async () => {
      mockSandboxCreate.mockRejectedValue(new Error('Creation failed'));

      await expect(backend.warmup('session-123')).rejects.toThrow(SandboxError);
      await expect(backend.warmup('session-123')).rejects.toMatchObject({
        code: 'CREATION_FAILED',
      });
    });

    it('should throw SandboxError on state save failure', async () => {
      const mockSandbox = createMockSandbox('new-sandbox-id');
      mockSandboxCreate.mockResolvedValue(mockSandbox);
      mockStateRepository.saveState.mockRejectedValue(new Error('Save failed'));

      await expect(backend.warmup('session-123')).rejects.toThrow(SandboxError);
    });
  });

  describe('isReady()', () => {
    it('should return true when state exists', async () => {
      mockStateRepository.hasState.mockResolvedValue(true);

      const result = await backend.isReady('session-123');

      expect(result).toBe(true);
      expect(mockStateRepository.hasState).toHaveBeenCalledWith('session-123');
    });

    it('should return false when state does not exist', async () => {
      mockStateRepository.hasState.mockResolvedValue(false);

      const result = await backend.isReady('session-123');

      expect(result).toBe(false);
    });
  });

  describe('cleanup()', () => {
    it('should stop sandbox and delete state', async () => {
      const mockSandbox = createMockSandbox('sandbox-to-cleanup');
      mockStateRepository.getState.mockResolvedValue({ sandboxId: 'sandbox-to-cleanup' });
      mockSandboxGet.mockResolvedValue(mockSandbox);

      await backend.cleanup('session-123');

      expect(mockStateRepository.getState).toHaveBeenCalledWith('session-123');
      expect(mockSandboxGet).toHaveBeenCalledWith({ sandboxId: 'sandbox-to-cleanup' });
      expect(mockSandbox.stop).toHaveBeenCalled();
      expect(mockStateRepository.deleteState).toHaveBeenCalledWith('session-123');
    });

    it('should succeed even if no state exists', async () => {
      mockStateRepository.getState.mockResolvedValue(null);

      await expect(backend.cleanup('session-123')).resolves.not.toThrow();

      expect(mockSandboxGet).not.toHaveBeenCalled();
      expect(mockStateRepository.deleteState).not.toHaveBeenCalled();
    });

    it('should continue cleanup even if sandbox stop fails', async () => {
      const mockSandbox = createMockSandbox('sandbox-to-cleanup');
      mockSandbox.stop.mockRejectedValue(new Error('Stop failed'));
      mockStateRepository.getState.mockResolvedValue({ sandboxId: 'sandbox-to-cleanup' });
      mockSandboxGet.mockResolvedValue(mockSandbox);

      await expect(backend.cleanup('session-123')).resolves.not.toThrow();

      expect(mockStateRepository.deleteState).toHaveBeenCalledWith('session-123');
    });

    it('should not throw if sandbox is already stopped', async () => {
      const mockSandbox = createMockSandbox('sandbox-to-cleanup', 'stopped');
      mockStateRepository.getState.mockResolvedValue({ sandboxId: 'sandbox-to-cleanup' });
      mockSandboxGet.mockResolvedValue(mockSandbox);

      await expect(backend.cleanup('session-123')).resolves.not.toThrow();

      expect(mockSandbox.stop).not.toHaveBeenCalled();
      expect(mockStateRepository.deleteState).toHaveBeenCalled();
    });
  });

  describe('execute()', () => {
    it('should return error if no sessionId provided', async () => {
      const submission: CodeSubmission = { code: 'print("hello")' };

      const result = await backend.execute(submission, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Session ID is required for Vercel Sandbox execution');
    });

    it('should get sandbox and run code', async () => {
      const mockSandbox = createMockSandbox('test-sandbox');
      mockSandbox.runCommand.mockResolvedValue({
        exitCode: 0,
        stdout: jest.fn().mockResolvedValue('Hello, World!\n'),
        stderr: jest.fn().mockResolvedValue(''),
      });
      mockStateRepository.getState.mockResolvedValue({ sandboxId: 'test-sandbox' });
      mockSandboxGet.mockResolvedValue(mockSandbox);

      const submission: CodeSubmission = { code: 'print("Hello, World!")' };
      const result = await backend.execute(submission, { sessionId: 'session-123' });

      expect(result.success).toBe(true);
      expect(result.output).toBe('Hello, World!\n');
      expect(mockSandbox.writeFiles).toHaveBeenCalled();
      expect(mockSandbox.runCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          cmd: 'python3',
          args: ['main.py'],
          cwd: '/vercel/sandbox',
        })
      );
    });

    it('should pipe stdin via shell redirection when stdin is provided', async () => {
      const mockSandbox = createMockSandbox('test-sandbox');
      mockSandbox.runCommand.mockResolvedValue({
        exitCode: 0,
        stdout: jest.fn().mockResolvedValue('10\n'),
        stderr: jest.fn().mockResolvedValue(''),
      });
      mockStateRepository.getState.mockResolvedValue({ sandboxId: 'test-sandbox' });
      mockSandboxGet.mockResolvedValue(mockSandbox);

      const submission: CodeSubmission = {
        code: 'print(input())',
        executionSettings: { stdin: '10' },
      };
      const result = await backend.execute(submission, { sessionId: 'session-123' });

      expect(result.success).toBe(true);
      // When stdin is provided, should use bash with shell redirection
      expect(mockSandbox.runCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          cmd: 'bash',
          args: ['-c', 'python3 main.py < /tmp/stdin.txt'],
          cwd: '/vercel/sandbox',
        })
      );
      // stdin file should be written
      expect(mockSandbox.writeFiles).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ path: '/tmp/stdin.txt' }),
        ])
      );
    });

    it('should run python3 directly when no stdin is provided', async () => {
      const mockSandbox = createMockSandbox('test-sandbox');
      mockSandbox.runCommand.mockResolvedValue({
        exitCode: 0,
        stdout: jest.fn().mockResolvedValue('hello\n'),
        stderr: jest.fn().mockResolvedValue(''),
      });
      mockStateRepository.getState.mockResolvedValue({ sandboxId: 'test-sandbox' });
      mockSandboxGet.mockResolvedValue(mockSandbox);

      const submission: CodeSubmission = { code: 'print("hello")' };
      await backend.execute(submission, { sessionId: 'session-123' });

      expect(mockSandbox.runCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          cmd: 'python3',
          args: ['main.py'],
        })
      );
    });

    it('should inject random seed when provided', async () => {
      const mockSandbox = createMockSandbox('test-sandbox');
      mockSandbox.runCommand.mockResolvedValue({
        exitCode: 0,
        stdout: jest.fn().mockResolvedValue(''),
        stderr: jest.fn().mockResolvedValue(''),
      });
      mockStateRepository.getState.mockResolvedValue({ sandboxId: 'test-sandbox' });
      mockSandboxGet.mockResolvedValue(mockSandbox);

      const submission: CodeSubmission = {
        code: 'print(random.random())',
        executionSettings: { randomSeed: 42 },
      };
      await backend.execute(submission, { sessionId: 'session-123' });

      // Check that writeFiles was called with code containing the seed injection
      expect(mockSandbox.writeFiles).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'main.py',
            content: expect.any(Buffer),
          }),
        ])
      );

      // Verify the content includes the seed injection
      const writeFilesCall = mockSandbox.writeFiles.mock.calls[0][0];
      const mainPyFile = writeFilesCall.find((f: { path: string }) => f.path === 'main.py');
      const content = mainPyFile.content.toString();
      expect(content).toContain('import random');
      expect(content).toContain('random.seed(42)');
    });

    it('should handle attached files', async () => {
      const mockSandbox = createMockSandbox('test-sandbox');
      mockSandbox.runCommand.mockResolvedValue({
        exitCode: 0,
        stdout: jest.fn().mockResolvedValue(''),
        stderr: jest.fn().mockResolvedValue(''),
      });
      mockStateRepository.getState.mockResolvedValue({ sandboxId: 'test-sandbox' });
      mockSandboxGet.mockResolvedValue(mockSandbox);

      const submission: CodeSubmission = {
        code: 'print(open("data.txt").read())',
        executionSettings: {
          attachedFiles: [{ name: 'data.txt', content: 'test data' }],
        },
      };
      await backend.execute(submission, { sessionId: 'session-123' });

      expect(mockSandbox.writeFiles).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ path: 'data.txt' }),
        ])
      );
    });

    it('should return execution error on non-zero exit code', async () => {
      const mockSandbox = createMockSandbox('test-sandbox');
      mockSandbox.runCommand.mockResolvedValue({
        exitCode: 1,
        stdout: jest.fn().mockResolvedValue(''),
        stderr: jest.fn().mockResolvedValue('SyntaxError: invalid syntax'),
      });
      mockStateRepository.getState.mockResolvedValue({ sandboxId: 'test-sandbox' });
      mockSandboxGet.mockResolvedValue(mockSandbox);

      const submission: CodeSubmission = { code: 'print(' };
      const result = await backend.execute(submission, { sessionId: 'session-123' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('SyntaxError: invalid syntax');
    });

    it('should return error when no sandbox found', async () => {
      mockStateRepository.getState.mockResolvedValue(null);

      const submission: CodeSubmission = { code: 'print("hello")' };
      const result = await backend.execute(submission, { sessionId: 'session-123' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Code execution temporarily unavailable');
    });

    it('should recreate sandbox when it has timed out', async () => {
      // First getState call returns old sandbox
      mockStateRepository.getState.mockResolvedValue({ sandboxId: 'old-sandbox' });

      // Old sandbox is not running
      const oldSandbox = createMockSandbox('old-sandbox', 'stopped');
      mockSandboxGet.mockResolvedValueOnce(oldSandbox);

      // Create returns new sandbox
      const newSandbox = createMockSandbox('new-sandbox');
      newSandbox.runCommand.mockResolvedValue({
        exitCode: 0,
        stdout: jest.fn().mockResolvedValue('output'),
        stderr: jest.fn().mockResolvedValue(''),
      });
      mockSandboxCreate.mockResolvedValue(newSandbox);

      const submission: CodeSubmission = { code: 'print("hello")' };
      const result = await backend.execute(submission, { sessionId: 'session-123' });

      expect(result.success).toBe(true);
      expect(mockSandboxCreate).toHaveBeenCalled();
      expect(mockStateRepository.saveState).toHaveBeenCalledWith('session-123', {
        sandboxId: 'new-sandbox',
      });
    });
  });

  describe('trace()', () => {
    it('should return error if no sessionId provided', async () => {
      const result = await backend.trace('print("hello")', {});

      expect(result.exitCode).toBe(1);
      expect(result.error).toBe('Session ID is required for Vercel Sandbox tracing');
    });

    it('should get sandbox, write tracer, and run trace', async () => {
      const mockSandbox = createMockSandbox('test-sandbox');
      const traceOutput = JSON.stringify({
        steps: [{ line: 1, event: 'line', locals: {}, globals: {}, callStack: [], stdout: '' }],
        totalSteps: 1,
        exitCode: 0,
        error: null,
        truncated: false,
      });
      mockSandbox.runCommand.mockResolvedValue({
        exitCode: 0,
        stdout: jest.fn().mockResolvedValue(traceOutput),
        stderr: jest.fn().mockResolvedValue(''),
      });
      mockStateRepository.getState.mockResolvedValue({ sandboxId: 'test-sandbox' });
      mockSandboxGet.mockResolvedValue(mockSandbox);

      const result = await backend.trace('x = 1', { sessionId: 'session-123' });

      expect(result.exitCode).toBe(0);
      expect(result.totalSteps).toBe(1);
      expect(result.steps).toHaveLength(1);
      expect(mockSandbox.writeFiles).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ path: '/tmp/tracer.py' }),
        ])
      );
    });

    it('should pass stdin and maxSteps to tracer', async () => {
      const mockSandbox = createMockSandbox('test-sandbox');
      const traceOutput = JSON.stringify({
        steps: [],
        totalSteps: 0,
        exitCode: 0,
        error: null,
        truncated: false,
      });
      mockSandbox.runCommand.mockResolvedValue({
        exitCode: 0,
        stdout: jest.fn().mockResolvedValue(traceOutput),
        stderr: jest.fn().mockResolvedValue(''),
      });
      mockStateRepository.getState.mockResolvedValue({ sandboxId: 'test-sandbox' });
      mockSandboxGet.mockResolvedValue(mockSandbox);

      await backend.trace('input()', {
        sessionId: 'session-123',
        executionSettings: { stdin: 'test input' },
        maxSteps: 100,
      });

      expect(mockSandbox.runCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          args: ['/tmp/tracer.py', 'input()', 'test input', '100'],
        })
      );
    });

    it('should return error trace on parse failure', async () => {
      const mockSandbox = createMockSandbox('test-sandbox');
      mockSandbox.runCommand.mockResolvedValue({
        exitCode: 0,
        stdout: jest.fn().mockResolvedValue('not valid json'),
        stderr: jest.fn().mockResolvedValue(''),
      });
      mockStateRepository.getState.mockResolvedValue({ sandboxId: 'test-sandbox' });
      mockSandboxGet.mockResolvedValue(mockSandbox);

      const result = await backend.trace('x = 1', { sessionId: 'session-123' });

      expect(result.exitCode).toBe(1);
      expect(result.error).toBe('Failed to parse trace output');
    });

    it('should inject random seed when provided', async () => {
      const mockSandbox = createMockSandbox('test-sandbox');
      const traceOutput = JSON.stringify({
        steps: [],
        totalSteps: 0,
        exitCode: 0,
        error: null,
        truncated: false,
      });
      mockSandbox.runCommand.mockResolvedValue({
        exitCode: 0,
        stdout: jest.fn().mockResolvedValue(traceOutput),
        stderr: jest.fn().mockResolvedValue(''),
      });
      mockStateRepository.getState.mockResolvedValue({ sandboxId: 'test-sandbox' });
      mockSandboxGet.mockResolvedValue(mockSandbox);

      await backend.trace('import random\nprint(random.random())', {
        sessionId: 'session-123',
        executionSettings: { randomSeed: 42 },
      });

      // Verify the code passed to tracer includes seed injection
      expect(mockSandbox.runCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          args: expect.arrayContaining([
            expect.stringContaining('import random\nrandom.seed(42)'),
          ]),
        })
      );
    });

    it('should handle attached files in tracing', async () => {
      const mockSandbox = createMockSandbox('test-sandbox');
      const traceOutput = JSON.stringify({
        steps: [],
        totalSteps: 0,
        exitCode: 0,
        error: null,
        truncated: false,
      });
      mockSandbox.runCommand.mockResolvedValue({
        exitCode: 0,
        stdout: jest.fn().mockResolvedValue(traceOutput),
        stderr: jest.fn().mockResolvedValue(''),
      });
      mockStateRepository.getState.mockResolvedValue({ sandboxId: 'test-sandbox' });
      mockSandboxGet.mockResolvedValue(mockSandbox);

      await backend.trace('print(open("data.txt").read())', {
        sessionId: 'session-123',
        executionSettings: {
          attachedFiles: [{ name: 'data.txt', content: 'test data' }],
        },
      });

      // Verify attached file is written to sandbox
      expect(mockSandbox.writeFiles).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ path: 'data.txt' }),
        ])
      );
    });

    it('should handle both randomSeed and attachedFiles together', async () => {
      const mockSandbox = createMockSandbox('test-sandbox');
      const traceOutput = JSON.stringify({
        steps: [],
        totalSteps: 0,
        exitCode: 0,
        error: null,
        truncated: false,
      });
      mockSandbox.runCommand.mockResolvedValue({
        exitCode: 0,
        stdout: jest.fn().mockResolvedValue(traceOutput),
        stderr: jest.fn().mockResolvedValue(''),
      });
      mockStateRepository.getState.mockResolvedValue({ sandboxId: 'test-sandbox' });
      mockSandboxGet.mockResolvedValue(mockSandbox);

      await backend.trace('import random\nprint(open("data.txt").read())', {
        sessionId: 'session-123',
        executionSettings: {
          randomSeed: 42,
          attachedFiles: [{ name: 'data.txt', content: 'test data' }],
        },
      });

      // Verify code has seed injection
      expect(mockSandbox.runCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          args: expect.arrayContaining([
            expect.stringContaining('import random\nrandom.seed(42)'),
          ]),
        })
      );

      // Verify attached file is written
      expect(mockSandbox.writeFiles).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ path: 'data.txt' }),
        ])
      );
    });
  });

  describe('getStatus()', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return unavailable when not on Vercel', async () => {
      delete process.env.VERCEL;
      delete process.env.VERCEL_SANDBOX_ENABLED;

      const status = await backend.getStatus();

      expect(status.available).toBe(false);
      expect(status.healthy).toBe(false);
      expect(status.message).toBe('Not running on Vercel');
    });

    it('should return unavailable when sandbox not enabled', async () => {
      process.env.VERCEL = '1';
      delete process.env.VERCEL_SANDBOX_ENABLED;

      const status = await backend.getStatus();

      expect(status.available).toBe(false);
      expect(status.healthy).toBe(false);
      expect(status.message).toBe('Vercel Sandbox is not enabled');
    });

    it('should return available when on Vercel with sandbox enabled', async () => {
      process.env.VERCEL = '1';
      process.env.VERCEL_SANDBOX_ENABLED = '1';

      const status = await backend.getStatus();

      expect(status.available).toBe(true);
      expect(status.healthy).toBe(true);
      expect(status.message).toBe('Vercel Sandbox is available');
    });
  });
});

describe('SandboxError', () => {
  it('should create error with all properties', () => {
    const cause = new Error('Original error');
    const error = new SandboxError(
      'Test error',
      'CREATION_FAILED',
      'session-123',
      cause
    );

    expect(error.message).toBe('Test error');
    expect(error.name).toBe('SandboxError');
    expect(error.code).toBe('CREATION_FAILED');
    expect(error.sessionId).toBe('session-123');
    expect(error.cause).toBe(cause);
  });

  it('should work without optional properties', () => {
    const error = new SandboxError('Test error', 'TIMEOUT');

    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TIMEOUT');
    expect(error.sessionId).toBeUndefined();
    expect(error.cause).toBeUndefined();
  });
});
