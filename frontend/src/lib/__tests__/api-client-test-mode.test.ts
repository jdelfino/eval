/**
 * Tests for api-client with configurable auth
 *
 * Uses the auth-provider module to configure test tokens.
 */
export {};

const SAVED_ENV = process.env;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  process.env = { ...SAVED_ENV, NEXT_PUBLIC_API_URL: 'http://localhost:8080' };
  global.fetch = jest.fn();
});

afterAll(() => {
  process.env = SAVED_ENV;
});

describe('api-client with test auth', () => {
  beforeEach(() => {
    // Mock withRetry to just call the function directly
    jest.mock('@/lib/api-utils', () => ({
      ...jest.requireActual('@/lib/api-utils'),
      withRetry: jest.fn((fn: () => Promise<any>) => fn()),
    }));
  });

  it('uses configured test token', async () => {
    // Configure a test token
    const { configureTestAuth } = require('../auth-provider');
    configureTestAuth('test:ext-123:user@test.local');

    const { getAuthHeaders } = require('../api-client');
    const headers = await getAuthHeaders();
    expect(headers).toEqual({ Authorization: 'Bearer test:ext-123:user@test.local' });
  });

  it('apiGet sends auth header', async () => {
    const { configureTestAuth } = require('../auth-provider');
    configureTestAuth('test:ext-abc:abc@test.local');

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: '1' }),
    });

    const { apiGet } = require('../api-client');
    await apiGet('/v1/test');

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8080/v1/test',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test:ext-abc:abc@test.local',
        }),
      })
    );
  });
});

describe('api-client with Firebase auth', () => {
  it('uses Firebase token from auth provider', async () => {
    const mockGetIdToken = jest.fn().mockResolvedValue('firebase-token-xyz');

    jest.mock('@/lib/firebase', () => ({
      firebaseAuth: { currentUser: { getIdToken: mockGetIdToken } },
    }));

    jest.mock('@/lib/api-utils', () => ({
      ...jest.requireActual('@/lib/api-utils'),
      withRetry: jest.fn((fn: () => Promise<any>) => fn()),
    }));

    // Reset auth provider to default (Firebase)
    const { resetAuthProvider } = require('../auth-provider');
    resetAuthProvider();

    const { getAuthHeaders } = require('../api-client');
    const headers = await getAuthHeaders();
    expect(headers).toEqual({ Authorization: 'Bearer firebase-token-xyz' });
  });
});
