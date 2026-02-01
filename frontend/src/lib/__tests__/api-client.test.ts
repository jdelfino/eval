/**
 * Tests for api-client
 */

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
      const { getAuthHeaders } = require('@/lib/api-client');

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

      const { apiGet } = require('@/lib/api-client');
      const result = await apiGet('/api/v1/users');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/users',
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

      const { apiPost } = require('@/lib/api-client');
      const result = await apiPost('/api/v1/users', { email: 'test@example.com' });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/users',
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

      const { apiPatch } = require('@/lib/api-client');
      await apiPatch('/api/v1/users/1', { name: 'updated' });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/users/1',
        expect.objectContaining({ method: 'PATCH' })
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

      const { apiDelete } = require('@/lib/api-client');
      await apiDelete('/api/v1/users/1');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/users/1',
        expect.objectContaining({ method: 'DELETE' })
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

      const { apiGet } = require('@/lib/api-client');
      await expect(apiGet('/api/v1/missing')).rejects.toThrow();
    });
  });
});
