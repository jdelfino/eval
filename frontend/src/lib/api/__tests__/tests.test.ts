/**
 * Unit tests for the tests API client (test execution endpoints).
 *
 * @jest-environment jsdom
 */

const mockApiPost = jest.fn();

jest.mock('@/lib/api-client', () => ({
  apiPost: (...args: unknown[]) => mockApiPost(...args),
}));

import { runTests, runSessionTests } from '../tests';

describe('runTests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('posts to /student-work/{id}/test with no body when no testName', async () => {
    const mockResponse = {
      results: [],
      summary: { total: 0, passed: 0, failed: 0, errors: 0, run: 0, time_ms: 0 },
    };
    mockApiPost.mockResolvedValue(mockResponse);

    const result = await runTests('work-123');

    expect(mockApiPost).toHaveBeenCalledWith('/student-work/work-123/test', {});
    expect(result).toEqual(mockResponse);
  });

  it('posts with test_name when testName is provided', async () => {
    const mockResponse = {
      results: [{ name: 'test1', type: 'io', status: 'passed', time_ms: 10 }],
      summary: { total: 1, passed: 1, failed: 0, errors: 0, run: 0, time_ms: 10 },
    };
    mockApiPost.mockResolvedValue(mockResponse);

    const result = await runTests('work-456', 'test1');

    expect(mockApiPost).toHaveBeenCalledWith('/student-work/work-456/test', { test_name: 'test1' });
    expect(result).toEqual(mockResponse);
  });

  it('propagates errors from apiPost', async () => {
    mockApiPost.mockRejectedValue(new Error('Network error'));

    await expect(runTests('work-789')).rejects.toThrow('Network error');
  });

  it('returns TestResponse with results and summary', async () => {
    const mockResponse = {
      results: [
        {
          name: 'case1',
          type: 'io',
          status: 'failed',
          input: 'hello',
          expected: 'HELLO',
          actual: 'hello',
          time_ms: 15,
        },
      ],
      summary: { total: 1, passed: 0, failed: 1, errors: 0, run: 0, time_ms: 15 },
    };
    mockApiPost.mockResolvedValue(mockResponse);

    const result = await runTests('work-abc');

    expect(result.results).toHaveLength(1);
    expect(result.results[0].status).toBe('failed');
    expect(result.summary.failed).toBe(1);
  });
});

describe('runSessionTests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('posts to /sessions/{id}/test with required code', async () => {
    const mockResponse = {
      results: [],
      summary: { total: 0, passed: 0, failed: 0, errors: 0, run: 0, time_ms: 0 },
    };
    mockApiPost.mockResolvedValue(mockResponse);

    const result = await runSessionTests('session-123', 'print("hi")');

    expect(mockApiPost).toHaveBeenCalledWith('/sessions/session-123/test', {
      code: 'print("hi")',
    });
    expect(result).toEqual(mockResponse);
  });

  it('posts with test_name when provided', async () => {
    mockApiPost.mockResolvedValue({
      results: [],
      summary: { total: 0, passed: 0, failed: 0, errors: 0, run: 0, time_ms: 0 },
    });

    await runSessionTests('session-123', 'print("hi")', 'my_test');

    expect(mockApiPost).toHaveBeenCalledWith('/sessions/session-123/test', {
      code: 'print("hi")',
      test_name: 'my_test',
    });
  });

  it('propagates errors from apiPost', async () => {
    mockApiPost.mockRejectedValue(new Error('Unauthorized'));

    await expect(
      runSessionTests('session-x', 'code')
    ).rejects.toThrow('Unauthorized');
  });
});
