/**
 * Integration tests for api-client.
 * Mocks firebase and global fetch, but tests the REAL api-client functions.
 */
export {};

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

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  process.env = { ...ORIGINAL_ENV, NEXT_PUBLIC_API_URL: 'http://localhost:8080' };
  global.fetch = jest.fn();
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('api-client integration', () => {
  describe('apiGet adds Authorization header', () => {
    it('sends Bearer token from firebase user', async () => {
      mockGetIdToken.mockResolvedValue('test-token');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ items: [] }),
      });

      const { apiGet } = require('../api-client');
      await apiGet('/v1/items');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8080/v1/items',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      );
    });
  });

  describe('apiPost sends JSON body with correct Content-Type', () => {
    it('includes Content-Type and stringified body', async () => {
      mockGetIdToken.mockResolvedValue('test-token');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: '1' }),
      });

      const { apiPost } = require('../api-client');
      await apiPost('/v1/items', { name: 'foo' });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8080/v1/items',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-token',
          }),
          body: JSON.stringify({ name: 'foo' }),
        })
      );
    });
  });

  describe('apiFetch retries on 5xx errors', () => {
    it('retries and eventually succeeds', async () => {
      mockGetIdToken.mockResolvedValue('test-token');

      const error5xx = {
        ok: false,
        status: 503,
        json: () => Promise.resolve({ error: 'Service unavailable' }),
      };
      const success = {
        ok: true,
        json: () => Promise.resolve({ data: 'ok' }),
      };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(error5xx)
        .mockResolvedValueOnce(success);

      // Use real withRetry but with fast delays
      jest.useFakeTimers();
      const { apiFetch } = require('../api-client');

      const promise = apiFetch('/v1/data');

      // Fast-forward through retry delays
      for (let i = 0; i < 10; i++) {
        await Promise.resolve();
        jest.advanceTimersByTime(15000);
        await Promise.resolve();
      }

      const response = await promise;
      expect(response.ok).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });
  });

  describe('apiFetch throws with .status on 4xx errors', () => {
    it('throws error with status property for 404', async () => {
      mockGetIdToken.mockResolvedValue('test-token');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Not found' }),
      });

      const { apiFetch } = require('../api-client');
      const err: any = await apiFetch('/v1/missing').catch((e: any) => e);

      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('Not found');
      expect(err.status).toBe(404);
    });
  });

  describe('URL construction', () => {
    it('prepends BASE_URL to path', async () => {
      mockGetIdToken.mockResolvedValue('test-token');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const { apiGet } = require('../api-client');
      await apiGet('/v1/test');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8080/v1/test',
        expect.anything()
      );
    });
  });
});
