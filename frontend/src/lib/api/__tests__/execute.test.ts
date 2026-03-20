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

  it('wraps legacy stdin into cases[].input', async () => {
    await executeCode('print("hi")', 'python', { stdin: 'input text' });

    const body = mockApiPost.mock.calls[0][1] as Record<string, unknown>;
    expect(body).not.toHaveProperty('stdin');
    expect(body.cases).toEqual([{ name: 'run', input: 'input text', match_type: 'exact' }]);
  });

  it('wraps legacy random_seed into cases[].random_seed', async () => {
    await executeCode('print("hi")', 'python', { random_seed: 42 });

    const body = mockApiPost.mock.calls[0][1] as Record<string, unknown>;
    expect(body).not.toHaveProperty('random_seed');
    const casesDef = body.cases as any[];
    expect(casesDef[0].random_seed).toBe(42);
  });

  it('wraps legacy attached_files into cases[].attached_files', async () => {
    const files = [{ name: 'data.txt', content: 'hello' }];

    await executeCode('print("hi")', 'python', { attached_files: files });

    const body = mockApiPost.mock.calls[0][1] as Record<string, unknown>;
    expect(body).not.toHaveProperty('attached_files');
    const casesDef = body.cases as any[];
    expect(casesDef[0].attached_files).toEqual(files);
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
