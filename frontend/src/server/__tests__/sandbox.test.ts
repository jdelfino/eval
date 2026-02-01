import { EventEmitter } from 'events';

// Use jest.mock with factory returning the mocked module
jest.mock('child_process', () => {
  const actual = jest.requireActual('child_process');
  return {
    ...actual,
    execSync: jest.fn(),
    spawn: jest.fn(),
  };
});

// Import after mock is set up
import * as childProcess from 'child_process';
import {
  isNsjailAvailable,
  isSandboxEnabled,
  getSandboxStatus,
  spawnSandboxed,
  resetSandboxCache,
} from '../sandbox';

const mockExecSync = childProcess.execSync as jest.MockedFunction<typeof childProcess.execSync>;
const mockSpawn = childProcess.spawn as jest.MockedFunction<typeof childProcess.spawn>;

describe('sandbox', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetSandboxCache();
    delete process.env.DISABLE_SANDBOX;

    // Default mock behavior: nsjail is NOT found (throws)
    // Individual tests can override this
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd === 'which nsjail') {
        throw new Error('not found');
      }
      // Return empty string for other commands (like which python3)
      return Buffer.from('');
    });
  });

  describe('isNsjailAvailable', () => {
    it('should return true when nsjail is found', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'which nsjail') {
          return Buffer.from('/usr/bin/nsjail');
        }
        return Buffer.from('');
      });

      expect(isNsjailAvailable()).toBe(true);
      expect(mockExecSync).toHaveBeenCalledWith('which nsjail', { stdio: 'ignore' });
    });

    it('should return false when nsjail is not found', () => {
      // Default mock already throws for 'which nsjail'
      expect(isNsjailAvailable()).toBe(false);
    });

    it('should cache the result', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'which nsjail') {
          return Buffer.from('/usr/bin/nsjail');
        }
        return Buffer.from('');
      });

      isNsjailAvailable();
      isNsjailAvailable();
      isNsjailAvailable();

      // Should only check once (the 'which nsjail' call)
      const whichNsjailCalls = mockExecSync.mock.calls.filter(
        call => call[0] === 'which nsjail'
      );
      expect(whichNsjailCalls.length).toBe(1);
    });
  });

  describe('isSandboxEnabled', () => {
    it('should return true when nsjail is available and not disabled', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'which nsjail') {
          return Buffer.from('/usr/bin/nsjail');
        }
        return Buffer.from('');
      });

      expect(isSandboxEnabled()).toBe(true);
    });

    it('should return false when DISABLE_SANDBOX is true', () => {
      process.env.DISABLE_SANDBOX = 'true';
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'which nsjail') {
          return Buffer.from('/usr/bin/nsjail');
        }
        return Buffer.from('');
      });

      expect(isSandboxEnabled()).toBe(false);
    });

    it('should return false when nsjail is not available', () => {
      // Default mock already throws for 'which nsjail'
      expect(isSandboxEnabled()).toBe(false);
    });
  });

  describe('getSandboxStatus', () => {
    it('should return correct status when nsjail is available and enabled', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'which nsjail') {
          return Buffer.from('/usr/bin/nsjail');
        }
        return Buffer.from('');
      });

      const status = getSandboxStatus();

      expect(status.available).toBe(true);
      expect(status.enabled).toBe(true);
      expect(status.reason).toBeUndefined();
    });

    it('should return correct status when nsjail is not available', () => {
      // Default mock already throws for 'which nsjail'
      const status = getSandboxStatus();

      expect(status.available).toBe(false);
      expect(status.enabled).toBe(false);
      expect(status.reason).toBe('nsjail not found in PATH');
    });

    it('should return correct status when sandbox is disabled via env var', () => {
      process.env.DISABLE_SANDBOX = 'true';
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'which nsjail') {
          return Buffer.from('/usr/bin/nsjail');
        }
        return Buffer.from('');
      });

      const status = getSandboxStatus();

      expect(status.available).toBe(true);
      expect(status.enabled).toBe(false);
      expect(status.reason).toBe('Disabled via DISABLE_SANDBOX environment variable');
    });
  });

  describe('spawnSandboxed', () => {
    function createMockProcess() {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.stdin = {
        write: jest.fn(),
        end: jest.fn(),
      };
      mockProcess.kill = jest.fn();
      mockProcess.killed = false;
      return mockProcess;
    }

    it('should fall back to direct spawn when sandbox is disabled', () => {
      process.env.DISABLE_SANDBOX = 'true';
      resetSandboxCache();
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'which nsjail') {
          return Buffer.from('/usr/bin/nsjail');
        }
        return Buffer.from('');
      });

      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess as any);

      const result = spawnSandboxed('python3', ['-c', 'print("hello")']);

      expect(mockSpawn).toHaveBeenCalledWith('python3', ['-c', 'print("hello")'], {});
      expect(result).toBe(mockProcess);
    });

    it('should throw error when nsjail is not available and sandbox not disabled', () => {
      // Default mock already throws for 'which nsjail'
      expect(() => {
        spawnSandboxed('python3', ['-c', 'print("hello")']);
      }).toThrow('Sandbox (nsjail) is required but not available');
    });

    it('should pass cwd option in fallback mode', () => {
      process.env.DISABLE_SANDBOX = 'true';
      resetSandboxCache();
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'which nsjail') {
          return Buffer.from('/usr/bin/nsjail');
        }
        return Buffer.from('');
      });

      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess as any);

      spawnSandboxed('python3', ['-c', 'print("hello")'], { cwd: '/tmp/test' });

      expect(mockSpawn).toHaveBeenCalledWith('python3', ['-c', 'print("hello")'], { cwd: '/tmp/test' });
    });

    it('should use nsjail when available and enabled', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'which nsjail') {
          return Buffer.from('/usr/bin/nsjail');
        }
        if (cmd === 'which python3') {
          return Buffer.from('/usr/bin/python3');
        }
        // For python sys.path command
        return Buffer.from('/usr/lib/python3.11\n/usr/lib/python3');
      });

      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess as any);

      spawnSandboxed('python3', ['-c', 'print("hello")']);

      // Verify nsjail is called with expected args (network isolation enabled by default)
      expect(mockSpawn).toHaveBeenCalledWith('nsjail', expect.arrayContaining([
        '--mode', 'o',
        '--really_quiet',
      ]));
      // Verify the command is passed (python3 gets resolved to full path)
      const args = mockSpawn.mock.calls[0][1];
      expect(args).toContain('-c');
      expect(args).toContain('print("hello")');
    });

    it('should include additional read-only mounts when specified', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'which nsjail') {
          return Buffer.from('/usr/bin/nsjail');
        }
        if (cmd === 'which python3') {
          return Buffer.from('/usr/bin/python3');
        }
        return Buffer.from('/usr/lib/python3.11');
      });

      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess as any);

      spawnSandboxed('python3', ['/path/to/script.py'], {
        additionalMountsRO: ['/path/to/script.py'],
      });

      expect(mockSpawn).toHaveBeenCalledWith('nsjail', expect.arrayContaining([
        '--bindmount_ro', '/path/to/script.py',
      ]));
    });

    it('should include cwd as read-write mount when specified', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'which nsjail') {
          return Buffer.from('/usr/bin/nsjail');
        }
        if (cmd === 'which python3') {
          return Buffer.from('/usr/bin/python3');
        }
        return Buffer.from('/usr/lib/python3.11');
      });

      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess as any);

      spawnSandboxed('python3', ['-c', 'print("hello")'], { cwd: '/tmp/workdir' });

      expect(mockSpawn).toHaveBeenCalledWith('nsjail', expect.arrayContaining([
        '--bindmount', '/tmp/workdir',
        '--cwd', '/tmp/workdir',
      ]));
    });
  });

  describe('resetSandboxCache', () => {
    it('should allow re-checking nsjail availability', () => {
      // First check - not available (default mock)
      expect(isNsjailAvailable()).toBe(false);

      // Reset cache
      resetSandboxCache();

      // Change mock - now available
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'which nsjail') {
          return Buffer.from('/usr/bin/nsjail');
        }
        return Buffer.from('');
      });

      // Second check - should re-check
      expect(isNsjailAvailable()).toBe(true);

      // Verify 'which nsjail' was called twice
      const whichNsjailCalls = mockExecSync.mock.calls.filter(
        call => call[0] === 'which nsjail'
      );
      expect(whichNsjailCalls.length).toBe(2);
    });
  });
});
