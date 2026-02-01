/**
 * Unit tests for API utilities including retry logic
 */

import { withRetry, withRetryInfo, fetchWithRetry, createUserFriendlyError } from '../api-utils';

describe('api-utils', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('withRetry', () => {
    it('should return result on first successful attempt', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const resultPromise = withRetry(fn);
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce('success');

      const resultPromise = withRetry(fn, { maxRetries: 3, initialDelay: 100 });

      // Run through all timers
      await jest.runAllTimersAsync();

      const result = await resultPromise;
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-retryable errors', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Unauthorized'));

      await expect(withRetry(fn, { maxRetries: 3 })).rejects.toThrow('Unauthorized');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should throw after max retries exceeded', async () => {
      jest.useRealTimers(); // Use real timers for this test

      const fn = jest.fn().mockRejectedValue(new Error('Network error'));

      await expect(
        withRetry(fn, { maxRetries: 2, initialDelay: 10, maxDelay: 50 })
      ).rejects.toThrow('Network error');

      expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries

      jest.useFakeTimers(); // Restore fake timers
    });

    it('should call onRetry callback on each retry', async () => {
      const onRetry = jest.fn();
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce('success');

      const resultPromise = withRetry(fn, { maxRetries: 3, initialDelay: 100, onRetry });

      await jest.runAllTimersAsync();
      await resultPromise;

      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenNthCalledWith(1, 1, expect.any(Error), expect.any(Number));
      expect(onRetry).toHaveBeenNthCalledWith(2, 2, expect.any(Error), expect.any(Number));
    });

    it('should use custom shouldRetry function', async () => {
      const shouldRetry = jest.fn().mockReturnValue(false);
      const fn = jest.fn().mockRejectedValue(new Error('Network error'));

      await expect(withRetry(fn, { maxRetries: 3, shouldRetry })).rejects.toThrow();

      expect(shouldRetry).toHaveBeenCalledWith(expect.any(Error));
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should respect maxRetries option', async () => {
      jest.useRealTimers(); // Use real timers for this test

      const fn = jest.fn().mockRejectedValue(new Error('Server error'));

      await expect(
        withRetry(fn, { maxRetries: 1, initialDelay: 10, maxDelay: 50 })
      ).rejects.toThrow();

      expect(fn).toHaveBeenCalledTimes(2); // Initial + 1 retry

      jest.useFakeTimers(); // Restore fake timers
    });

    it('should handle string errors', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce('string error')
        .mockResolvedValueOnce('success');

      const resultPromise = withRetry(fn, { maxRetries: 1, initialDelay: 100 });

      await jest.runAllTimersAsync();

      const result = await resultPromise;
      expect(result).toBe('success');
    });
  });

  describe('withRetryInfo', () => {
    it('should return attempt info on success', async () => {
      const fn = jest.fn().mockResolvedValue('data');

      const result = await withRetryInfo(fn);

      expect(result.data).toBe('data');
      expect(result.attempts).toBe(1);
      expect(result.wasRetried).toBe(false);
    });

    it('should track retry attempts', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce('data');

      const resultPromise = withRetryInfo(fn, { maxRetries: 2, initialDelay: 100 });

      await jest.runAllTimersAsync();

      const result = await resultPromise;
      expect(result.data).toBe('data');
      expect(result.attempts).toBe(2);
      expect(result.wasRetried).toBe(true);
    });
  });

  describe('fetchWithRetry', () => {
    const mockFetch = jest.fn();
    global.fetch = mockFetch;

    beforeEach(() => {
      mockFetch.mockReset();
    });

    it('should return response on successful fetch', async () => {
      const mockResponse = new Response('ok', { status: 200 });
      mockFetch.mockResolvedValue(mockResponse);

      const response = await fetchWithRetry('/api/test');

      expect(response).toBe(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith('/api/test', undefined);
    });

    it('should pass fetch options', async () => {
      const mockResponse = new Response('ok', { status: 200 });
      mockFetch.mockResolvedValue(mockResponse);

      const fetchOptions = { method: 'POST', body: 'data' };
      await fetchWithRetry('/api/test', { fetchOptions });

      expect(mockFetch).toHaveBeenCalledWith('/api/test', fetchOptions);
    });

    it('should retry on network errors', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(new Response('ok', { status: 200 }));

      const resultPromise = fetchWithRetry('/api/test', { maxRetries: 1, initialDelay: 100 });

      await jest.runAllTimersAsync();

      const response = await resultPromise;
      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should retry on 500 status codes', async () => {
      mockFetch
        .mockResolvedValueOnce(new Response('error', { status: 500, statusText: 'Internal Server Error' }))
        .mockResolvedValueOnce(new Response('ok', { status: 200 }));

      const resultPromise = fetchWithRetry('/api/test', { maxRetries: 1, initialDelay: 100 });

      await jest.runAllTimersAsync();

      const response = await resultPromise;
      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should not retry on 400 status codes', async () => {
      mockFetch.mockResolvedValue(new Response('error', { status: 400, statusText: 'Bad Request' }));

      const response = await fetchWithRetry('/api/test');

      expect(response.status).toBe(400);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should retry on configurable status codes', async () => {
      mockFetch
        .mockResolvedValueOnce(new Response('error', { status: 429, statusText: 'Too Many Requests' }))
        .mockResolvedValueOnce(new Response('ok', { status: 200 }));

      const resultPromise = fetchWithRetry('/api/test', {
        maxRetries: 1,
        initialDelay: 100,
        retryStatusCodes: [429],
      });

      await jest.runAllTimersAsync();

      const response = await resultPromise;
      expect(response.status).toBe(200);
    });
  });

  describe('createUserFriendlyError', () => {
    it('should create error with user-friendly message', () => {
      const error = createUserFriendlyError(new Error('ECONNREFUSED'));

      expect(error.message).toBe('Connection error. Please check your internet and try again.');
      expect((error as any).originalError).toBeInstanceOf(Error);
      expect((error as any).category).toBe('network');
      expect((error as any).isRetryable).toBe(true);
    });

    it('should handle string input', () => {
      const error = createUserFriendlyError('Unauthorized');

      expect(error.message).toBe('Your session has expired. Please sign in again.');
      expect((error as any).category).toBe('auth');
      expect((error as any).isRetryable).toBe(false);
    });

    it('should preserve original error', () => {
      const original = new Error('Server error 500');
      const error = createUserFriendlyError(original);

      expect((error as any).originalError).toBe(original);
    });
  });
});
