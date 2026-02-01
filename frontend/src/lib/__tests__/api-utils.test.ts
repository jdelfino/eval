/**
 * Unit tests for API utilities including retry logic
 * @jest-environment node
 */

import { withRetry } from '../api-utils';
import * as apiUtils from '../api-utils';

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

  describe('dead code removal', () => {
    it('should not export withRetryInfo', () => {
      expect('withRetryInfo' in apiUtils).toBe(false);
    });

    it('should not export RetryResult', () => {
      expect('RetryResult' in apiUtils).toBe(false);
    });
  });

});
