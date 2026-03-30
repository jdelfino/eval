/**
 * Unit tests for the trace API client.
 *
 * Verifies that traceCode() accepts IOTestCase (not ExecutionSettings) and
 * maps fields correctly: testCase.input → body.stdin, testCase.attached_files → body.files.
 *
 * @jest-environment jsdom
 */

const mockApiPost = jest.fn();

jest.mock('@/lib/api-client', () => ({
  apiPost: (...args: unknown[]) => mockApiPost(...args),
}));

import { traceCode } from '../trace';
import type { IOTestCase } from '@/types/api';

const mockTrace = {
  steps: [{ line: 1, event: 'call', locals: {}, globals: {}, call_stack: [], stdout: '' }],
  total_steps: 1,
  exit_code: 0,
};

describe('traceCode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiPost.mockResolvedValue(mockTrace);
  });

  it('posts to /trace with code and language', async () => {
    const testCase: IOTestCase = { name: 'default', input: '', match_type: 'exact', order: 0 };
    await traceCode('print("hello")', 'python', testCase);

    expect(mockApiPost).toHaveBeenCalledWith('/trace', expect.objectContaining({
      code: 'print("hello")',
      language: 'python',
    }));
  });

  it('maps testCase.input to body.stdin', async () => {
    const testCase: IOTestCase = { name: 'default', input: 'hello world', match_type: 'exact', order: 0 };
    await traceCode('print(input())', 'python', testCase);

    const body = mockApiPost.mock.calls[0][1] as Record<string, unknown>;
    expect(body.stdin).toBe('hello world');
  });

  it('omits stdin when testCase.input is empty string', async () => {
    const testCase: IOTestCase = { name: 'default', input: '', match_type: 'exact', order: 0 };
    await traceCode('print("hi")', 'python', testCase);

    const body = mockApiPost.mock.calls[0][1] as Record<string, unknown>;
    expect(body).not.toHaveProperty('stdin');
  });

  it('maps testCase.random_seed to body.random_seed', async () => {
    const testCase: IOTestCase = { name: 'default', input: '', match_type: 'exact', order: 0, random_seed: 42 };
    await traceCode('print("hi")', 'python', testCase);

    const body = mockApiPost.mock.calls[0][1] as Record<string, unknown>;
    expect(body.random_seed).toBe(42);
  });

  it('omits random_seed when not present in testCase', async () => {
    const testCase: IOTestCase = { name: 'default', input: 'x', match_type: 'exact', order: 0 };
    await traceCode('print("hi")', 'python', testCase);

    const body = mockApiPost.mock.calls[0][1] as Record<string, unknown>;
    expect(body).not.toHaveProperty('random_seed');
  });

  it('maps testCase.attached_files to body.files', async () => {
    const files = [{ name: 'data.txt', content: 'hello' }];
    const testCase: IOTestCase = { name: 'default', input: '', match_type: 'exact', order: 0, attached_files: files };
    await traceCode('print("hi")', 'python', testCase);

    const body = mockApiPost.mock.calls[0][1] as Record<string, unknown>;
    expect(body.files).toEqual(files);
    expect(body).not.toHaveProperty('attached_files');
  });

  it('omits files when testCase.attached_files is absent', async () => {
    const testCase: IOTestCase = { name: 'default', input: '', match_type: 'exact', order: 0 };
    await traceCode('print("hi")', 'python', testCase);

    const body = mockApiPost.mock.calls[0][1] as Record<string, unknown>;
    expect(body).not.toHaveProperty('files');
    expect(body).not.toHaveProperty('attached_files');
  });

  it('passes maxSteps as max_steps in body', async () => {
    const testCase: IOTestCase = { name: 'default', input: '', match_type: 'exact', order: 0 };
    await traceCode('print("hi")', 'python', testCase, 500);

    const body = mockApiPost.mock.calls[0][1] as Record<string, unknown>;
    expect(body.max_steps).toBe(500);
  });

  it('omits max_steps when not provided', async () => {
    const testCase: IOTestCase = { name: 'default', input: '', match_type: 'exact', order: 0 };
    await traceCode('print("hi")', 'python', testCase);

    const body = mockApiPost.mock.calls[0][1] as Record<string, unknown>;
    expect(body).not.toHaveProperty('max_steps');
  });

  it('returns the trace response', async () => {
    const testCase: IOTestCase = { name: 'default', input: '', match_type: 'exact', order: 0 };
    const result = await traceCode('print("hi")', 'python', testCase);

    expect(result).toEqual(mockTrace);
  });
});
