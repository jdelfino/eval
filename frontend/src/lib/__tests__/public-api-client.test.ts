/**
 * Tests for public-api-client
 */

// Mock withRetry to just call the function directly
jest.mock('@/lib/api-utils', () => ({
  ...jest.requireActual('@/lib/api-utils'),
  withRetry: jest.fn((fn: () => Promise<any>) => fn()),
}));

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
  process.env = { ...ORIGINAL_ENV, NEXT_PUBLIC_API_URL: 'http://localhost:8080' };
  global.fetch = jest.fn();
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('public-api-client', () => {
  describe('publicFetch', () => {
    it('makes request to BASE_URL + path without auth headers', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: 'test' }),
      });

      const { publicFetch } = require('../public-api-client');
      await publicFetch('/auth/register');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8080/auth/register',
        expect.objectContaining({})
      );
      // Should NOT have Authorization header
      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      expect(callArgs[1].headers?.Authorization).toBeUndefined();
    });

    it('passes through custom options', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const { publicFetch } = require('../public-api-client');
      await publicFetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@test.com' }),
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8080/auth/register',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'test@test.com' }),
        })
      );
    });

    it('throws on non-ok response with error from body', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Bad request' }),
      });

      const { publicFetch } = require('../public-api-client');
      const err: any = await publicFetch('/auth/register').catch((e: any) => e);
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('Bad request');
      expect(err.status).toBe(400);
    });

    it('includes code from error body on thrown error', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Section inactive', code: 'SECTION_INACTIVE' }),
      });

      const { publicFetch } = require('../public-api-client');
      const err: any = await publicFetch('/auth/register-student').catch((e: any) => e);
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('Section inactive');
      expect(err.status).toBe(400);
      expect(err.code).toBe('SECTION_INACTIVE');
    });

    it('throws with status code when error body has no error field', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      });

      const { publicFetch } = require('../public-api-client');
      const err: any = await publicFetch('/test').catch((e: any) => e);
      expect(err.message).toBe('Request failed: 500');
    });

    it('handles non-JSON error response', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 502,
        json: () => Promise.reject(new Error('invalid json')),
      });

      const { publicFetch } = require('../public-api-client');
      const err: any = await publicFetch('/test').catch((e: any) => e);
      expect(err.message).toBe('Request failed: 502');
      expect(err.status).toBe(502);
    });

    it('uses withRetry for retry logic', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const { withRetry } = require('@/lib/api-utils');
      const { publicFetch } = require('../public-api-client');
      await publicFetch('/test');

      expect(withRetry).toHaveBeenCalled();
    });
  });

  describe('publicGet', () => {
    it('makes GET request and returns parsed JSON', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: '1', name: 'test' }),
      });

      const { publicGet } = require('../public-api-client');
      const result = await publicGet('/public/problems/1');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8080/public/problems/1',
        expect.objectContaining({})
      );
      expect(result).toEqual({ id: '1', name: 'test' });
    });

    it('forwards RequestInit options (e.g., Next.js revalidate)', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: '1' }),
      });

      const { publicGet } = require('../public-api-client');
      await publicGet('/public/problems/1', { next: { revalidate: 60 } } as RequestInit);

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8080/public/problems/1',
        expect.objectContaining({ next: { revalidate: 60 } })
      );
    });
  });

  describe('publicPost', () => {
    it('makes POST request with JSON body and returns parsed JSON', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const { publicPost } = require('../public-api-client');
      const result = await publicPost('/auth/register', { email: 'test@test.com' });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8080/auth/register',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'test@test.com' }),
        })
      );
      expect(result).toEqual({ success: true });
    });

    it('makes POST without body when body is undefined', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const { publicPost } = require('../public-api-client');
      await publicPost('/auth/action');

      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      expect(callArgs[1].body).toBeUndefined();
    });
  });

  describe('publicFetchRaw', () => {
    it('returns raw Response on success for custom handling', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: 'test' }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const { publicFetchRaw } = require('../public-api-client');
      const response = await publicFetchRaw('/auth/accept-invite?token=abc');

      expect(response).toBe(mockResponse);
    });

    it('returns raw Response on error for custom error handling', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        json: () => Promise.resolve({ code: 'OTP_EXPIRED' }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const { publicFetchRaw } = require('../public-api-client');
      const response = await publicFetchRaw('/auth/accept-invite?token=abc');

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
    });

    it('uses withRetry for retry logic', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      const { withRetry } = require('@/lib/api-utils');
      const { publicFetchRaw } = require('../public-api-client');
      await publicFetchRaw('/test');

      expect(withRetry).toHaveBeenCalled();
    });
  });
});
