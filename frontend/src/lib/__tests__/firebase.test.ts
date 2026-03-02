/**
 * Unit tests for firebase initialization module.
 * @jest-environment jsdom
 */

const mockGetAuth = jest.fn().mockReturnValue({ name: 'auth-instance' });
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
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('initializes Firebase and does not call connectAuthEmulator when emulator host is not set', async () => {
    delete process.env.NEXT_PUBLIC_AUTH_MODE;
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
    delete process.env.NEXT_PUBLIC_AUTH_MODE;
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

  it('does not call connectAuthEmulator in test mode even if emulator host is set', async () => {
    process.env.NEXT_PUBLIC_AUTH_MODE = 'test';
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

    expect(mockConnectAuthEmulator).not.toHaveBeenCalled();
  });
});
