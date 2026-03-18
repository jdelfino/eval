/**
 * Unit tests for the execute API client.
 *
 * @jest-environment jsdom
 */

const mockApiFetch = jest.fn();
const mockApiPost = jest.fn();

jest.mock('@/lib/api-client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  apiPost: (...args: unknown[]) => mockApiPost(...args),
}));

import { warmExecutor, executeCode } from '../execute';

describe('executeCode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns TestResponse shape (results[], summary) not ExecutionResult', async () => {
    const mockResult = {
      results: [{ name: 'run', type: 'io', status: 'run', actual: 'hello\n', time_ms: 50 }],
      summary: { total: 1, passed: 0, failed: 0, errors: 0, run: 0, time_ms: 50 },
    };
    mockApiPost.mockResolvedValue(mockResult);

    const result = await executeCode('print("hello")', 'python');

    expect(result).toEqual(mockResult);
    // Must have results[] and summary, NOT success/execution_time_ms
    expect(result).toHaveProperty('results');
    expect(result).toHaveProperty('summary');
    expect(result).not.toHaveProperty('success');
    expect(result).not.toHaveProperty('execution_time_ms');
  });

  it('posts to /execute with code, language, and cases', async () => {
    const mockResult = {
      results: [{ name: 'Case 1', type: 'io', status: 'run', actual: 'hello\n', time_ms: 50 }],
      summary: { total: 1, passed: 0, failed: 0, errors: 0, run: 0, time_ms: 50 },
    };
    mockApiPost.mockResolvedValue(mockResult);

    const cases = [{ name: 'Case 1', input: '', match_type: 'exact' as const }];
    const result = await executeCode('print("hello")', 'python', { cases });

    expect(mockApiPost).toHaveBeenCalledWith('/execute', {
      code: 'print("hello")',
      language: 'python',
      cases,
    });
    expect(result).toEqual(mockResult);
  });

  it('posts to /execute without cases when not provided', async () => {
    const mockResult = {
      results: [{ name: 'run', type: 'io', status: 'run', actual: 'hello\n', time_ms: 50 }],
      summary: { total: 1, passed: 0, failed: 0, errors: 0, run: 0, time_ms: 50 },
    };
    mockApiPost.mockResolvedValue(mockResult);

    const result = await executeCode('print("hello")', 'python');

    expect(mockApiPost).toHaveBeenCalledWith('/execute', { code: 'print("hello")', language: 'python' });
    expect(result).toEqual(mockResult);
  });

  it('does not include undefined optional fields', async () => {
    mockApiPost.mockResolvedValue({
      results: [],
      summary: { total: 0, passed: 0, failed: 0, errors: 0, run: 0, time_ms: 0 },
    });

    await executeCode('print("hi")', 'python', {});

    const body = mockApiPost.mock.calls[0][1] as Record<string, unknown>;
    expect(body).not.toHaveProperty('cases');
    // Legacy fields should not be sent
    expect(body).not.toHaveProperty('stdin');
    expect(body).not.toHaveProperty('random_seed');
    expect(body).not.toHaveProperty('files');
  });

  it('sends cases array with all case fields', async () => {
    mockApiPost.mockResolvedValue({
      results: [],
      summary: { total: 0, passed: 0, failed: 0, errors: 0, run: 0, time_ms: 0 },
    });

    const cases = [
      { name: 'Case 1', input: 'hello', match_type: 'exact' as const, expected_output: 'HELLO', random_seed: 42 },
      { name: 'Case 2', input: '', match_type: 'contains' as const },
    ];
    await executeCode('print("hi")', 'python', { cases });

    expect(mockApiPost).toHaveBeenCalledWith('/execute', {
      code: 'print("hi")',
      language: 'python',
      cases,
    });
  });
});

describe('warmExecutor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls POST /executor/warm', async () => {
    mockApiFetch.mockResolvedValue({ ok: true });

    await warmExecutor();

    expect(mockApiFetch).toHaveBeenCalledWith('/executor/warm', { method: 'POST' });
  });

  it('returns void on success', async () => {
    mockApiFetch.mockResolvedValue({ ok: true });

    const result = await warmExecutor();

    expect(result).toBeUndefined();
  });

  it('propagates errors from apiFetch', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network error'));

    await expect(warmExecutor()).rejects.toThrow('Network error');
  });
});
