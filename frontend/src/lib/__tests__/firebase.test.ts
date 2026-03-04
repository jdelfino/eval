/**
 * Unit tests for firebase initialization module.
 * @jest-environment jsdom
 */

const mockAuthInstance = { name: 'auth-instance', tenantId: null as string | null };
const mockGetAuth = jest.fn().mockReturnValue(mockAuthInstance);
const mockConnectAuthEmulator = jest.fn();
const mockInitializeApp = jest.fn().mockReturnValue({ name: 'test-app' });
const mockGetApps = jest.fn();

jest.mock('firebase/app', () => ({
  initializeApp: mockInitializeApp,
  getApps: mockGetApps,
}));

jest.mock('firebase/auth', () => ({
  getAuth: mockGetAuth,
  connectAuthEmulator: mockConnectAuthEmulator,
}));

describe('firebase initialization', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    mockGetApps.mockReturnValue([]);
    mockAuthInstance.tenantId = null;
    mockGetAuth.mockReturnValue(mockAuthInstance);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('initializes Firebase and does not call connectAuthEmulator when emulator host is not set', async () => {
    delete process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST;

    // Re-mock after resetModules
    jest.mock('firebase/app', () => ({
      initializeApp: mockInitializeApp,
      getApps: mockGetApps,
    }));
    jest.mock('firebase/auth', () => ({
      getAuth: mockGetAuth,
      connectAuthEmulator: mockConnectAuthEmulator,
    }));

    await import('../firebase');

    expect(mockConnectAuthEmulator).not.toHaveBeenCalled();
  });

  it('calls connectAuthEmulator when NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST is set', async () => {
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST = 'http://localhost:9099';

    jest.mock('firebase/app', () => ({
      initializeApp: mockInitializeApp,
      getApps: mockGetApps,
    }));
    jest.mock('firebase/auth', () => ({
      getAuth: mockGetAuth,
      connectAuthEmulator: mockConnectAuthEmulator,
    }));

    await import('../firebase');

    expect(mockConnectAuthEmulator).toHaveBeenCalledWith(
      expect.anything(),
      'http://localhost:9099'
    );
  });

  it('calls connectAuthEmulator when NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST is set (no test mode guard)', async () => {
    // The old NEXT_PUBLIC_AUTH_MODE=test guard was removed. Now emulator is connected
    // whenever NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST is set, regardless of any other env var.
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST = 'http://localhost:9099';

    jest.mock('firebase/app', () => ({
      initializeApp: mockInitializeApp,
      getApps: mockGetApps,
    }));
    jest.mock('firebase/auth', () => ({
      getAuth: mockGetAuth,
      connectAuthEmulator: mockConnectAuthEmulator,
    }));

    await import('../firebase');

    expect(mockConnectAuthEmulator).toHaveBeenCalledWith(
      expect.anything(),
      'http://localhost:9099'
    );
  });

  it('always initializes Firebase regardless of NEXT_PUBLIC_AUTH_MODE', async () => {
    // After the test-mode guard is removed, Firebase must always initialize.
    // Previously, NEXT_PUBLIC_AUTH_MODE=test skipped initialization entirely.
    process.env.NEXT_PUBLIC_AUTH_MODE = 'test';
    delete process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST;

    jest.mock('firebase/app', () => ({
      initializeApp: mockInitializeApp,
      getApps: mockGetApps,
    }));
    jest.mock('firebase/auth', () => ({
      getAuth: mockGetAuth,
      connectAuthEmulator: mockConnectAuthEmulator,
    }));

    await import('../firebase');

    // initializeApp (or getApps) must have been called — Firebase is always initialized
    expect(mockGetAuth).toHaveBeenCalled();
  });

  it('sets tenantId on auth instance when NEXT_PUBLIC_FIREBASE_TENANT_ID is set', async () => {
    process.env.NEXT_PUBLIC_FIREBASE_TENANT_ID = 'staging-tenant-abc123';
    delete process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST;

    jest.mock('firebase/app', () => ({
      initializeApp: mockInitializeApp,
      getApps: mockGetApps,
    }));
    jest.mock('firebase/auth', () => ({
      getAuth: mockGetAuth,
      connectAuthEmulator: mockConnectAuthEmulator,
    }));

    await import('../firebase');

    expect(mockAuthInstance.tenantId).toBe('staging-tenant-abc123');
  });

  it('does not set tenantId when NEXT_PUBLIC_FIREBASE_TENANT_ID is not set', async () => {
    delete process.env.NEXT_PUBLIC_FIREBASE_TENANT_ID;
    delete process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST;

    jest.mock('firebase/app', () => ({
      initializeApp: mockInitializeApp,
      getApps: mockGetApps,
    }));
    jest.mock('firebase/auth', () => ({
      getAuth: mockGetAuth,
      connectAuthEmulator: mockConnectAuthEmulator,
    }));

    await import('../firebase');

    expect(mockAuthInstance.tenantId).toBeNull();
  });

  it('sets tenantId before connecting to emulator when both are set', async () => {
    process.env.NEXT_PUBLIC_FIREBASE_TENANT_ID = 'test-tenant';
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST = 'http://localhost:9099';

    const callOrder: string[] = [];
    mockGetAuth.mockReturnValue({
      ...mockAuthInstance,
      set tenantId(v: string | null) {
        callOrder.push('setTenantId');
        mockAuthInstance.tenantId = v;
      },
    });
    mockConnectAuthEmulator.mockImplementation(() => {
      callOrder.push('connectEmulator');
    });

    jest.mock('firebase/app', () => ({
      initializeApp: mockInitializeApp,
      getApps: mockGetApps,
    }));
    jest.mock('firebase/auth', () => ({
      getAuth: mockGetAuth,
      connectAuthEmulator: mockConnectAuthEmulator,
    }));

    await import('../firebase');

    expect(callOrder[0]).toBe('setTenantId');
    expect(callOrder[1]).toBe('connectEmulator');
  });
});
