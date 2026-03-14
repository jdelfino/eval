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

  it('posts to /execute with code and language', async () => {
    const mockResult = { success: true, output: 'hello\n', error: '', execution_time_ms: 50 };
    mockApiPost.mockResolvedValue(mockResult);

    const result = await executeCode('print("hello")', 'python');

    expect(mockApiPost).toHaveBeenCalledWith('/execute', { code: 'print("hello")', language: 'python' });
    expect(result).toEqual(mockResult);
  });

  it('maps attached_files to "files" field in the request body', async () => {
    mockApiPost.mockResolvedValue({ success: true, output: '', error: '', execution_time_ms: 10 });
    const files = [{ name: 'data.txt', content: 'hello' }];

    await executeCode('print("hi")', 'python', { attached_files: files });

    expect(mockApiPost).toHaveBeenCalledWith('/execute', {
      code: 'print("hi")',
      language: 'python',
      files,
    });
    // Ensure it does NOT send "attached_files" key
    const body = mockApiPost.mock.calls[0][1] as Record<string, unknown>;
    expect(body).not.toHaveProperty('attached_files');
  });

  it('includes stdin and random_seed when provided', async () => {
    mockApiPost.mockResolvedValue({ success: true, output: '', error: '', execution_time_ms: 10 });

    await executeCode('print("hi")', 'python', { stdin: 'input', random_seed: 42 });

    expect(mockApiPost).toHaveBeenCalledWith('/execute', {
      code: 'print("hi")',
      language: 'python',
      stdin: 'input',
      random_seed: 42,
    });
  });

  it('does not include undefined optional fields', async () => {
    mockApiPost.mockResolvedValue({ success: true, output: '', error: '', execution_time_ms: 10 });

    await executeCode('print("hi")', 'python', {});

    const body = mockApiPost.mock.calls[0][1] as Record<string, unknown>;
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
