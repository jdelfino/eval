/**
 * Tests for BackendRegistry
 *
 * Tests the factory pattern implementation for code execution backends.
 */

import {
  BackendRegistry,
  BackendRegistration,
  getBackendRegistry,
} from '../registry';
import {
  ICodeExecutionBackend,
  BackendCapabilities,
  BackendStatus,
  ExecutionResult,
  CodeSubmission,
} from '../interfaces';

/**
 * Create a mock backend for testing
 */
function createMockBackend(
  type: string,
  capabilities: Partial<BackendCapabilities> = {}
): ICodeExecutionBackend {
  const fullCapabilities: BackendCapabilities = {
    execute: true,
    trace: false,
    attachedFiles: false,
    stdin: false,
    randomSeed: false,
    stateful: false,
    requiresWarmup: false,
    ...capabilities,
  };

  return {
    backendType: type,
    capabilities: fullCapabilities,
    async execute(_submission: CodeSubmission): Promise<ExecutionResult> {
      return {
        success: true,
        output: `Output from ${type}`,
        error: '',
        executionTime: 100,
      };
    },
    async getStatus(): Promise<BackendStatus> {
      return { available: true, healthy: true };
    },
  };
}

/**
 * Create a mock registration for testing
 */
function createMockRegistration(
  type: string,
  options: {
    isAvailable?: boolean;
    capabilities?: Partial<BackendCapabilities>;
  } = {}
): BackendRegistration {
  const { isAvailable = true, capabilities = {} } = options;

  const fullCapabilities: BackendCapabilities = {
    execute: true,
    trace: false,
    attachedFiles: false,
    stdin: false,
    randomSeed: false,
    stateful: false,
    requiresWarmup: false,
    ...capabilities,
  };

  return {
    type,
    factory: () => createMockBackend(type, capabilities),
    isAvailable: () => isAvailable,
    capabilities: fullCapabilities,
  };
}

describe('BackendRegistry', () => {
  let registry: BackendRegistry;

  beforeEach(() => {
    registry = BackendRegistry.getInstance();
    registry.reset();
  });

  afterEach(() => {
    registry.reset();
  });

  describe('singleton pattern', () => {
    it('returns the same instance', () => {
      const instance1 = BackendRegistry.getInstance();
      const instance2 = BackendRegistry.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('getBackendRegistry returns the singleton', () => {
      const instance = getBackendRegistry();
      expect(instance).toBe(BackendRegistry.getInstance());
    });
  });

  describe('register', () => {
    it('registers a new backend', () => {
      const registration = createMockRegistration('test-backend');
      registry.register(registration);

      const backends = registry.list();
      expect(backends).toHaveLength(1);
      expect(backends[0].type).toBe('test-backend');
    });

    it('throws error when registering duplicate type', () => {
      const registration1 = createMockRegistration('duplicate-backend');
      const registration2 = createMockRegistration('duplicate-backend');

      registry.register(registration1);
      expect(() => registry.register(registration2)).toThrow(
        "Backend type 'duplicate-backend' is already registered"
      );
    });

    it('allows registering multiple different backends', () => {
      registry.register(createMockRegistration('backend-1'));
      registry.register(createMockRegistration('backend-2'));
      registry.register(createMockRegistration('backend-3'));

      const backends = registry.list();
      expect(backends).toHaveLength(3);
    });
  });

  describe('get', () => {
    it('returns backend instance by type', () => {
      registry.register(createMockRegistration('my-backend'));

      const backend = registry.get('my-backend');
      expect(backend).not.toBeNull();
      expect(backend?.backendType).toBe('my-backend');
    });

    it('returns null for unregistered type', () => {
      const backend = registry.get('nonexistent');
      expect(backend).toBeNull();
    });

    it('returns null for unavailable backend', () => {
      registry.register(
        createMockRegistration('unavailable-backend', { isAvailable: false })
      );

      const backend = registry.get('unavailable-backend');
      expect(backend).toBeNull();
    });

    it('calls factory each time', () => {
      let callCount = 0;
      const registration: BackendRegistration = {
        type: 'counted-backend',
        factory: () => {
          callCount++;
          return createMockBackend('counted-backend');
        },
        isAvailable: () => true,
        capabilities: {
          execute: true,
          trace: false,
          attachedFiles: false,
          stdin: false,
          randomSeed: false,
          stateful: false,
          requiresWarmup: false,
        },
      };

      registry.register(registration);

      registry.get('counted-backend');
      registry.get('counted-backend');
      registry.get('counted-backend');

      expect(callCount).toBe(3);
    });
  });

  describe('select', () => {
    describe('explicit selection order', () => {
      it('selects vercel-sandbox first when available', () => {
        registry.register(createMockRegistration('local-python'));
        registry.register(createMockRegistration('vercel-sandbox'));
        registry.register(createMockRegistration('disabled'));

        const backend = registry.select();
        expect(backend?.backendType).toBe('vercel-sandbox');
      });

      it('selects local-python when vercel-sandbox unavailable', () => {
        registry.register(
          createMockRegistration('vercel-sandbox', { isAvailable: false })
        );
        registry.register(createMockRegistration('local-python'));
        registry.register(createMockRegistration('disabled'));

        const backend = registry.select();
        expect(backend?.backendType).toBe('local-python');
      });

      it('selects disabled when others unavailable', () => {
        registry.register(
          createMockRegistration('vercel-sandbox', { isAvailable: false })
        );
        registry.register(
          createMockRegistration('local-python', { isAvailable: false })
        );
        registry.register(createMockRegistration('disabled'));

        const backend = registry.select();
        expect(backend?.backendType).toBe('disabled');
      });

      it('falls back to unknown backends if none in selection order available', () => {
        registry.register(createMockRegistration('custom-backend'));

        const backend = registry.select();
        expect(backend?.backendType).toBe('custom-backend');
      });
    });

    describe('with preferred backend', () => {
      beforeEach(() => {
        registry.register(createMockRegistration('vercel-sandbox'));
        registry.register(createMockRegistration('local-python'));
        registry.register(createMockRegistration('disabled'));
      });

      it('returns preferred backend if available', () => {
        const backend = registry.select({ preferred: 'local-python' });
        expect(backend?.backendType).toBe('local-python');
      });

      it('falls back to selection order if preferred unavailable', () => {
        registry.register(
          createMockRegistration('unavailable-preferred', { isAvailable: false })
        );

        const backend = registry.select({ preferred: 'unavailable-preferred' });
        expect(backend?.backendType).toBe('vercel-sandbox');
      });

      it('falls back to selection order if preferred not registered', () => {
        const backend = registry.select({ preferred: 'nonexistent' });
        expect(backend?.backendType).toBe('vercel-sandbox');
      });
    });

    describe('with required capabilities', () => {
      beforeEach(() => {
        registry.register(
          createMockRegistration('vercel-sandbox', {
            capabilities: { trace: true, attachedFiles: true },
          })
        );
        registry.register(
          createMockRegistration('local-python', {
            capabilities: { trace: true },
          })
        );
        registry.register(
          createMockRegistration('disabled', {
            capabilities: { execute: false },
          })
        );
      });

      it('filters backends by capabilities', () => {
        const backend = registry.select({
          requiredCapabilities: { trace: true, attachedFiles: true },
        });
        expect(backend?.backendType).toBe('vercel-sandbox');
      });

      it('selects first matching backend in selection order', () => {
        const backend = registry.select({
          requiredCapabilities: { trace: true },
        });
        expect(backend?.backendType).toBe('vercel-sandbox');
      });

      it('returns null if no backend matches capabilities', () => {
        const backend = registry.select({
          requiredCapabilities: { stateful: true },
        });
        expect(backend).toBeNull();
      });

      it('preferred backend must also match capabilities', () => {
        const backend = registry.select({
          preferred: 'disabled',
          requiredCapabilities: { trace: true },
        });
        // disabled doesn't have trace, falls back to selection order
        expect(backend?.backendType).toBe('vercel-sandbox');
      });
    });

    describe('with environment and sessionId', () => {
      beforeEach(() => {
        registry.register(createMockRegistration('vercel-sandbox'));
      });

      it('accepts environment hint', () => {
        const backend = registry.select({ environment: 'production' });
        expect(backend).not.toBeNull();
      });

      it('accepts sessionId', () => {
        const backend = registry.select({ sessionId: 'session-123' });
        expect(backend).not.toBeNull();
      });
    });

    describe('edge cases', () => {
      it('returns null when no backends registered', () => {
        registry.reset();
        const backend = registry.select();
        expect(backend).toBeNull();
      });

      it('returns null when all backends unavailable', () => {
        registry.reset();
        registry.register(
          createMockRegistration('unavailable-1', { isAvailable: false })
        );
        registry.register(
          createMockRegistration('unavailable-2', { isAvailable: false })
        );

        const backend = registry.select();
        expect(backend).toBeNull();
      });

      it('handles empty criteria object', () => {
        registry.register(createMockRegistration('vercel-sandbox'));
        const backend = registry.select({});
        expect(backend?.backendType).toBe('vercel-sandbox');
      });
    });
  });

  describe('list', () => {
    it('returns empty array when no backends registered', () => {
      const backends = registry.list();
      expect(backends).toEqual([]);
    });

    it('returns all registered backends', () => {
      registry.register(createMockRegistration('backend-a'));
      registry.register(createMockRegistration('backend-b'));

      const backends = registry.list();
      expect(backends).toHaveLength(2);
    });

    it('returns backends in selection order first', () => {
      registry.register(createMockRegistration('custom-backend'));
      registry.register(createMockRegistration('disabled'));
      registry.register(createMockRegistration('vercel-sandbox'));
      registry.register(createMockRegistration('local-python'));

      const backends = registry.list();
      // Selection order: vercel-sandbox, local-python, disabled, then others
      expect(backends[0].type).toBe('vercel-sandbox');
      expect(backends[1].type).toBe('local-python');
      expect(backends[2].type).toBe('disabled');
      expect(backends[3].type).toBe('custom-backend');
    });

    it('includes unavailable backends', () => {
      registry.register(
        createMockRegistration('available', { isAvailable: true })
      );
      registry.register(
        createMockRegistration('unavailable', { isAvailable: false })
      );

      const backends = registry.list();
      expect(backends).toHaveLength(2);
    });
  });

  describe('reset', () => {
    it('clears all registered backends', () => {
      registry.register(createMockRegistration('backend-1'));
      registry.register(createMockRegistration('backend-2'));

      expect(registry.list()).toHaveLength(2);

      registry.reset();

      expect(registry.list()).toHaveLength(0);
    });

    it('allows re-registering after reset', () => {
      registry.register(createMockRegistration('backend'));
      registry.reset();
      registry.register(createMockRegistration('backend'));

      expect(registry.list()).toHaveLength(1);
    });

    it('provides test isolation', () => {
      // Simulate first test
      registry.register(createMockRegistration('test-1-backend'));
      registry.reset();

      // Simulate second test
      registry.register(createMockRegistration('test-2-backend'));

      const backends = registry.list();
      expect(backends).toHaveLength(1);
      expect(backends[0].type).toBe('test-2-backend');
    });
  });

  describe('availability filtering', () => {
    it('skips unavailable backends', () => {
      registry.register(
        createMockRegistration('vercel-sandbox', { isAvailable: false })
      );
      registry.register(createMockRegistration('local-python'));

      const backend = registry.select();
      expect(backend?.backendType).toBe('local-python');
    });
  });

  describe('capability filtering', () => {
    beforeEach(() => {
      registry.register(
        createMockRegistration('vercel-sandbox', {
          capabilities: {
            execute: true,
            trace: false,
            attachedFiles: false,
            stdin: false,
            randomSeed: false,
            stateful: false,
            requiresWarmup: false,
          },
        })
      );
      registry.register(
        createMockRegistration('local-python', {
          capabilities: {
            execute: true,
            trace: true,
            attachedFiles: true,
            stdin: true,
            randomSeed: true,
            stateful: true,
            requiresWarmup: true,
          },
        })
      );
    });

    it('filters by single capability', () => {
      const backend = registry.select({
        requiredCapabilities: { trace: true },
      });
      expect(backend?.backendType).toBe('local-python');
    });

    it('filters by multiple capabilities', () => {
      const backend = registry.select({
        requiredCapabilities: { trace: true, attachedFiles: true, stdin: true },
      });
      expect(backend?.backendType).toBe('local-python');
    });

    it('ignores false capability requirements', () => {
      // Requiring trace: false should not exclude backends with trace: true
      const backend = registry.select({
        requiredCapabilities: { trace: false },
      });
      // Should return first in selection order (vercel-sandbox)
      expect(backend?.backendType).toBe('vercel-sandbox');
    });

    it('returns first in selection order when both match', () => {
      // Both have execute: true, so first in selection order wins
      const backend = registry.select({
        requiredCapabilities: { execute: true },
      });
      expect(backend?.backendType).toBe('vercel-sandbox');
    });
  });
});
