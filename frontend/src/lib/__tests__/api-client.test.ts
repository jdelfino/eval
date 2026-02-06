/**
 * Tests for api-client
 */
export {};

// Mock firebase before importing api-client
const mockGetIdToken = jest.fn();
const mockCurrentUser = { getIdToken: mockGetIdToken };

jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({ currentUser: mockCurrentUser })),
  onAuthStateChanged: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
}));

jest.mock('@/lib/firebase', () => ({
  firebaseAuth: { currentUser: mockCurrentUser },
}));

// Mock withRetry to just call the function directly
jest.mock('@/lib/api-utils', () => ({
  ...jest.requireActual('@/lib/api-utils'),
  withRetry: jest.fn((fn: () => Promise<any>) => fn()),
}));

// Set env var
const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ORIGINAL_ENV, NEXT_PUBLIC_API_URL: 'http://localhost:8080' };
  // Reset fetch mock
  global.fetch = jest.fn();
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('api-client', () => {
  describe('getAuthHeaders', () => {
    it('returns Authorization header with bearer token', async () => {
      mockGetIdToken.mockResolvedValue('test-token-123');
      const { getAuthHeaders } = require('../api-client');

      const headers = await getAuthHeaders();
      expect(headers).toEqual({ Authorization: 'Bearer test-token-123' });
    });
  });

  describe('apiGet', () => {
    it('makes GET request with auth headers to correct URL', async () => {
      mockGetIdToken.mockResolvedValue('token-abc');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: 'test' }),
      });

      const { apiGet } = require('../api-client');
      const result = await apiGet('/v1/users');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8080/v1/users',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer token-abc',
          }),
        })
      );
      expect(result).toEqual({ data: 'test' });
    });
  });

  describe('apiPost', () => {
    it('makes POST request with JSON body', async () => {
      mockGetIdToken.mockResolvedValue('token-abc');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: '1' }),
      });

      const { apiPost } = require('../api-client');
      const result = await apiPost('/v1/users', { email: 'test@example.com' });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8080/v1/users',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer token-abc',
          }),
          body: JSON.stringify({ email: 'test@example.com' }),
        })
      );
    });
  });

  describe('apiPatch', () => {
    it('makes PATCH request with JSON body', async () => {
      mockGetIdToken.mockResolvedValue('token-abc');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: '1' }),
      });

      const { apiPatch } = require('../api-client');
      await apiPatch('/v1/users/1', { name: 'updated' });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8080/v1/users/1',
        expect.objectContaining({ method: 'PATCH' })
      );
    });
  });

  describe('apiPut', () => {
    it('makes PUT request with JSON body', async () => {
      mockGetIdToken.mockResolvedValue('token-abc');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: '1', role: 'admin' }),
      });

      const { apiPut } = require('../api-client');
      const result = await apiPut('/v1/users/1/role', { role: 'admin' });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8080/v1/users/1/role',
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer token-abc',
          }),
          body: JSON.stringify({ role: 'admin' }),
        })
      );
      expect(result).toEqual({ id: '1', role: 'admin' });
    });

    it('makes PUT request without body when body is undefined', async () => {
      mockGetIdToken.mockResolvedValue('token-abc');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const { apiPut } = require('../api-client');
      await apiPut('/v1/items/1/activate');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8080/v1/items/1/activate',
        expect.objectContaining({
          method: 'PUT',
          body: undefined,
        })
      );
    });
  });

  describe('apiDelete', () => {
    it('makes DELETE request', async () => {
      mockGetIdToken.mockResolvedValue('token-abc');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const { apiDelete } = require('../api-client');
      await apiDelete('/v1/users/1');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8080/v1/users/1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('apiFetchRaw', () => {
    it('returns raw response on success without throwing', async () => {
      mockGetIdToken.mockResolvedValue('token-abc');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: 'test' }),
      });

      const { apiFetchRaw } = require('../api-client');
      const response = await apiFetchRaw('/v1/items');

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
    });

    it('returns raw response on error without throwing', async () => {
      mockGetIdToken.mockResolvedValue('token-abc');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Bad request', code: 'INVALID_INPUT' }),
      });

      const { apiFetchRaw } = require('../api-client');
      const response = await apiFetchRaw('/v1/items');

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
      // Unlike apiFetch, it doesn't throw
      const data = await response.json();
      expect(data.code).toBe('INVALID_INPUT');
    });

    it('includes Authorization header', async () => {
      mockGetIdToken.mockResolvedValue('token-xyz');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ id: '1' }),
      });

      const { apiFetchRaw } = require('../api-client');
      await apiFetchRaw('/v1/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'ABC123' }),
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8080/v1/register',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer token-xyz',
            'Content-Type': 'application/json',
          }),
        })
      );
    });
  });

  describe('apiFetch error handling', () => {
    it('throws on non-ok response', async () => {
      mockGetIdToken.mockResolvedValue('token-abc');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Not found' }),
      });

      const { apiGet } = require('../api-client');
      const err: any = await apiGet('/v1/missing').catch((e: any) => e);
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('Not found');
      expect(err.status).toBe(404);
    });

    it('uses status code as message when error JSON has no error field', async () => {
      mockGetIdToken.mockResolvedValue('token-abc');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      });

      const { apiGet } = require('../api-client');
      const err: any = await apiGet('/v1/broken').catch((e: any) => e);
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('Request failed: 500');
      expect(err.status).toBe(500);
    });

    it('handles non-JSON error response body', async () => {
      mockGetIdToken.mockResolvedValue('token-abc');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 502,
        json: () => Promise.reject(new Error('invalid json')),
      });

      const { apiGet } = require('../api-client');
      const err: any = await apiGet('/v1/bad-gateway').catch((e: any) => e);
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('Request failed: 502');
      expect(err.status).toBe(502);
    });
  });

  describe('null currentUser (PLAT-uum.50)', () => {
    it('getAuthHeaders throws when currentUser is null', async () => {
      const firebaseMock = require('@/lib/firebase');
      const original = firebaseMock.firebaseAuth.currentUser;
      firebaseMock.firebaseAuth.currentUser = null;

      try {
        const { getAuthHeaders } = require('../api-client');
        const err = await getAuthHeaders().catch((e: any) => e);
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('No authenticated user');
      } finally {
        firebaseMock.firebaseAuth.currentUser = original;
      }
    });

    it('apiGet throws when currentUser is null (logged out mid-request)', async () => {
      const firebaseMock = require('@/lib/firebase');
      const original = firebaseMock.firebaseAuth.currentUser;
      firebaseMock.firebaseAuth.currentUser = null;

      try {
        const { apiGet } = require('../api-client');
        const err: any = await apiGet('/v1/users').catch((e: any) => e);
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('No authenticated user');
      } finally {
        firebaseMock.firebaseAuth.currentUser = original;
      }
    });

    it('apiPost throws when currentUser is null', async () => {
      const firebaseMock = require('@/lib/firebase');
      const original = firebaseMock.firebaseAuth.currentUser;
      firebaseMock.firebaseAuth.currentUser = null;

      try {
        const { apiPost } = require('../api-client');
        const err: any = await apiPost('/v1/items', { name: 'test' }).catch((e: any) => e);
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('No authenticated user');
        expect(global.fetch).not.toHaveBeenCalled();
      } finally {
        firebaseMock.firebaseAuth.currentUser = original;
      }
    });

    it('apiDelete throws when currentUser is null', async () => {
      const firebaseMock = require('@/lib/firebase');
      const original = firebaseMock.firebaseAuth.currentUser;
      firebaseMock.firebaseAuth.currentUser = null;

      try {
        const { apiDelete } = require('../api-client');
        const err: any = await apiDelete('/v1/items/1').catch((e: any) => e);
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('No authenticated user');
        expect(global.fetch).not.toHaveBeenCalled();
      } finally {
        firebaseMock.firebaseAuth.currentUser = original;
      }
    });

    it('apiPut throws when currentUser is null', async () => {
      const firebaseMock = require('@/lib/firebase');
      const original = firebaseMock.firebaseAuth.currentUser;
      firebaseMock.firebaseAuth.currentUser = null;

      try {
        const { apiPut } = require('../api-client');
        const err: any = await apiPut('/v1/items/1', { name: 'test' }).catch((e: any) => e);
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('No authenticated user');
        expect(global.fetch).not.toHaveBeenCalled();
      } finally {
        firebaseMock.firebaseAuth.currentUser = original;
      }
    });
  });

  describe('null/undefined API response shapes (PLAT-uum.54)', () => {
    it('apiGet returns null when API responds with null body', async () => {
      mockGetIdToken.mockResolvedValue('token-abc');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(null),
      });

      const { apiGet } = require('../api-client');
      const result = await apiGet('/v1/users/1');
      expect(result).toBeNull();
    });

    it('apiGet returns response with missing expected fields', async () => {
      mockGetIdToken.mockResolvedValue('token-abc');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const { apiGet } = require('../api-client');
      const result = await apiGet('/v1/items');
      expect(result).toEqual({});
      expect((result as any).items).toBeUndefined();
      expect((result as any).total).toBeUndefined();
    });

    it('apiGet returns response with extra unexpected fields', async () => {
      mockGetIdToken.mockResolvedValue('token-abc');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: '1', name: 'test', _internal: true, debug: {} }),
      });

      const { apiGet } = require('../api-client');
      const result = await apiGet('/v1/items/1');
      expect(result).toEqual({ id: '1', name: 'test', _internal: true, debug: {} });
    });

    it('apiGet handles empty array response', async () => {
      mockGetIdToken.mockResolvedValue('token-abc');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      const { apiGet } = require('../api-client');
      const result = await apiGet('/v1/items');
      expect(result).toEqual([]);
    });

    it('apiGet handles null nested fields where objects expected', async () => {
      mockGetIdToken.mockResolvedValue('token-abc');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ user: null, settings: null, items: [] }),
      });

      const { apiGet } = require('../api-client');
      const result = await apiGet('/v1/profile');
      expect(result.user).toBeNull();
      expect(result.settings).toBeNull();
      expect(result.items).toEqual([]);
    });

    it('apiPost returns null when API responds with null', async () => {
      mockGetIdToken.mockResolvedValue('token-abc');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(null),
      });

      const { apiPost } = require('../api-client');
      const result = await apiPost('/v1/items', { name: 'test' });
      expect(result).toBeNull();
    });

    it('apiPatch returns response with missing fields', async () => {
      mockGetIdToken.mockResolvedValue('token-abc');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: '1' }),
      });

      const { apiPatch } = require('../api-client');
      const result = await apiPatch('/v1/items/1', { name: 'new' });
      expect(result).toEqual({ id: '1' });
      expect((result as any).name).toBeUndefined();
      expect((result as any).updatedAt).toBeUndefined();
    });

    it('apiGet handles undefined values in response object', async () => {
      mockGetIdToken.mockResolvedValue('token-abc');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: '1', name: undefined }),
      });

      const { apiGet } = require('../api-client');
      const result = await apiGet('/v1/items/1');
      expect(result.id).toBe('1');
      expect(result.name).toBeUndefined();
    });
  });
});
