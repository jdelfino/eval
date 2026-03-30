/**
 * Unit tests for the execute API client.
 *
 * ExecuteOptions only accepts { cases?: CaseDef[] } — legacy stdin/random_seed/attached_files
 * fields have been removed. All execution data must be passed via cases[].
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

const mockTestResponse = {
  results: [{ name: 'run', type: 'io', status: 'run', input: '', actual: 'hello\n', time_ms: 50 }],
  summary: { total: 1, passed: 0, failed: 0, errors: 0, run: 1, time_ms: 50 },
};

describe('executeCode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiPost.mockResolvedValue(mockTestResponse);
  });

  it('posts to /execute with code and language (no options → no cases)', async () => {
    const result = await executeCode('print("hello")', 'python');

    expect(mockApiPost).toHaveBeenCalledWith('/execute', { code: 'print("hello")', language: 'python' });
    expect(result).toEqual(mockTestResponse);
  });

  it('sends cases[] directly when cases option provided', async () => {
    const cases = [{ name: 'test', input: 'foo', match_type: 'exact' as const, expected_output: 'foo' }];

    await executeCode('print(input())', 'python', { cases });

    expect(mockApiPost).toHaveBeenCalledWith('/execute', {
      code: 'print(input())',
      language: 'python',
      cases,
    });
  });

  it('does not include cases when no options are provided', async () => {
    await executeCode('print("hi")', 'python', {});

    const body = mockApiPost.mock.calls[0][1] as Record<string, unknown>;
    expect(body).not.toHaveProperty('cases');
    expect(body).not.toHaveProperty('stdin');
    expect(body).not.toHaveProperty('random_seed');
    expect(body).not.toHaveProperty('files');
    expect(body).not.toHaveProperty('attached_files');
  });

  it('sends cases with random_seed when provided in CaseDef', async () => {
    const cases = [{ name: 'test', input: 'hi', match_type: 'exact' as const, random_seed: 42 }];

    await executeCode('print("hi")', 'python', { cases });

    const body = mockApiPost.mock.calls[0][1] as Record<string, unknown>;
    expect((body.cases as any[])[0].random_seed).toBe(42);
    expect(body).not.toHaveProperty('random_seed');
  });

  it('sends cases with attached_files when provided in CaseDef', async () => {
    const files = [{ name: 'data.txt', content: 'hello' }];
    const cases = [{ name: 'test', input: '', match_type: 'exact' as const, attached_files: files }];

    await executeCode('print("hi")', 'python', { cases });

    const body = mockApiPost.mock.calls[0][1] as Record<string, unknown>;
    expect((body.cases as any[])[0].attached_files).toEqual(files);
    expect(body).not.toHaveProperty('attached_files');
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
