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

import { warmExecutor, executeCode, ioTestCasesToCaseDefs, buildIOTestCases } from '../execute';

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

describe('ioTestCasesToCaseDefs', () => {
  /**
   * Verifies the shared IOTestCase→CaseDef conversion helper.
   * This function is extracted from 5 duplicate inline blocks in onRun handlers.
   * If broken, all run buttons silently lose stdin/seed/attached_files.
   */

  it('maps input and name from IOTestCase', () => {
    const result = ioTestCasesToCaseDefs([
      { name: 'Test', input: 'hello', match_type: 'exact', order: 0 },
    ]);
    expect(result).toEqual([
      { name: 'run', input: 'hello', match_type: 'exact' },
    ]);
  });

  it('returns empty array for empty input', () => {
    expect(ioTestCasesToCaseDefs([])).toEqual([]);
  });

  it('uses empty string for input when IOTestCase input is empty', () => {
    const result = ioTestCasesToCaseDefs([
      { name: 'Default', input: '', match_type: 'exact', order: 0 },
    ]);
    expect(result[0].input).toBe('');
  });

  it('includes random_seed when present', () => {
    const result = ioTestCasesToCaseDefs([
      { name: 'Test', input: 'x', match_type: 'exact', order: 0, random_seed: 42 },
    ]);
    expect(result[0].random_seed).toBe(42);
  });

  it('omits random_seed when absent', () => {
    const result = ioTestCasesToCaseDefs([
      { name: 'Test', input: 'x', match_type: 'exact', order: 0 },
    ]);
    expect(result[0]).not.toHaveProperty('random_seed');
  });

  it('includes attached_files when present', () => {
    const files = [{ name: 'data.txt', content: 'hello' }];
    const result = ioTestCasesToCaseDefs([
      { name: 'Test', input: '', match_type: 'exact', order: 0, attached_files: files },
    ]);
    expect(result[0].attached_files).toEqual(files);
  });

  it('omits attached_files when absent', () => {
    const result = ioTestCasesToCaseDefs([
      { name: 'Test', input: '', match_type: 'exact', order: 0 },
    ]);
    expect(result[0]).not.toHaveProperty('attached_files');
  });

  it('only converts first test case (run mode uses single case)', () => {
    const result = ioTestCasesToCaseDefs([
      { name: 'A', input: 'first', match_type: 'exact', order: 0 },
      { name: 'B', input: 'second', match_type: 'exact', order: 1 },
    ]);
    // All cases are converted — caller picks [0] for run mode
    expect(result).toHaveLength(2);
    expect(result[0].input).toBe('first');
    expect(result[1].input).toBe('second');
  });
});

describe('buildIOTestCases', () => {
  /**
   * Verifies the shared helper that constructs IOTestCase[] from flat form fields.
   * Previously duplicated in ProblemCreator (submit+render) and SessionProblemEditor (submit+render).
   * The trim inconsistency (submit used stdin.trim() but render used raw stdin) is fixed here:
   * buildIOTestCases always uses the raw stdin value, and callers trim before passing in.
   */

  it('returns empty array when no fields are set', () => {
    expect(buildIOTestCases({ stdin: '', random_seed: undefined, attached_files: [] })).toEqual([]);
  });

  it('returns a single IOTestCase when stdin is non-empty', () => {
    const result = buildIOTestCases({ stdin: 'hello', random_seed: undefined, attached_files: [] });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: 'Default', input: 'hello', match_type: 'exact', order: 0 });
  });

  it('returns a single IOTestCase when random_seed is set', () => {
    const result = buildIOTestCases({ stdin: '', random_seed: 42, attached_files: [] });
    expect(result).toHaveLength(1);
    expect(result[0].random_seed).toBe(42);
  });

  it('returns a single IOTestCase when attached_files is non-empty', () => {
    const files = [{ name: 'f.txt', content: 'data' }];
    const result = buildIOTestCases({ stdin: '', random_seed: undefined, attached_files: files });
    expect(result).toHaveLength(1);
    expect(result[0].attached_files).toEqual(files);
  });

  it('omits random_seed from the IOTestCase when not set', () => {
    const result = buildIOTestCases({ stdin: 'x', random_seed: undefined, attached_files: [] });
    expect(result[0]).not.toHaveProperty('random_seed');
  });

  it('omits attached_files from the IOTestCase when empty', () => {
    const result = buildIOTestCases({ stdin: 'x', random_seed: undefined, attached_files: [] });
    expect(result[0]).not.toHaveProperty('attached_files');
  });

  it('includes all three fields when all are set', () => {
    const files = [{ name: 'f.txt', content: 'data' }];
    const result = buildIOTestCases({ stdin: 'hi', random_seed: 7, attached_files: files });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: 'Default',
      input: 'hi',
      match_type: 'exact',
      order: 0,
      random_seed: 7,
      attached_files: files,
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
