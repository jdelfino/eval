/**
 * Tests for useCaseRunner hook.
 *
 * TC2: useCaseRunner returns typed CaseResult union — mock fetch returns a
 * CaseResultPytest shape; assert result.kind === 'pytest' narrows to pytest fields.
 * Catches: hook losing type discriminator, hook not accepting pytest cases.
 *
 * TC5: Hooks integrate end-to-end against a mock backend returning CaseResultPytest.
 * Uses jest.mock on api-client; asserts the hook yields the typed pytest result.
 * Catches: wire format mismatch between hook expectation and backend response.
 *
 * @jest-environment jsdom
 */

const mockApiPost = jest.fn();

jest.mock('@/lib/api-client', () => ({
  apiFetch: jest.fn(),
  apiPost: (...args: unknown[]) => mockApiPost(...args),
}));

import { renderHook, act } from '@testing-library/react';
import { useCaseRunner } from '../useCaseRunner';
import type { CaseResultPytest, CaseResultIO } from '@/types/api';

const mockPytestResponse = {
  results: [
    {
      kind: 'pytest' as const,
      name: 'tests/test_foo.py::test_bar',
      passed: true,
      duration_ms: 120,
      assertions: [
        { name: 'test_bar', passed: true },
      ],
    } satisfies CaseResultPytest,
  ],
  summary: { total: 1, passed: 1, failed: 0, errors: 0, run: 0, time_ms: 120 },
};

const mockIoResponse = {
  results: [
    {
      kind: 'io' as const,
      name: 'run',
      status: 'run',
      actual: 'hello\n',
      time_ms: 42,
    } satisfies CaseResultIO,
  ],
  summary: { total: 1, passed: 0, failed: 0, errors: 0, run: 1, time_ms: 42 },
};

describe('useCaseRunner — initial state', () => {
  beforeEach(() => jest.clearAllMocks());

  it('starts with no results, not running, no error', () => {
    const { result } = renderHook(() => useCaseRunner());

    expect(result.current.results).toBeNull();
    expect(result.current.isRunning).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.summary).toBeNull();
  });
});

describe('useCaseRunner — pytest cases (TC2 + TC5)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('TC2: returns typed CaseResult union — kind=pytest result narrows to pytest fields', async () => {
    /**
     * Verifies that useCaseRunner preserves the kind discriminator on results.
     * If the hook strips or mangles the kind field, consumers cannot narrow
     * CaseResultIO vs CaseResultPytest — they would have to use unsafe any casts.
     */
    mockApiPost.mockResolvedValueOnce(mockPytestResponse);

    const { result } = renderHook(() => useCaseRunner());

    await act(async () => {
      await result.current.runCases('def foo(): pass', 'python', [
        { kind: 'pytest' as const, name: 'test-bar', target_path: 'tests/t.py::test_bar', test_code: 'def test_bar(): pass' },
      ]);
    });

    expect(result.current.results).not.toBeNull();
    expect(result.current.results).toHaveLength(1);

    const firstResult = result.current.results![0];
    expect(firstResult.kind).toBe('pytest');

    // Narrow to pytest to access pytest-only fields
    if (firstResult.kind === 'pytest') {
      expect(firstResult.passed).toBe(true);
      expect(firstResult.duration_ms).toBe(120);
      expect(firstResult.assertions).toHaveLength(1);
      expect(firstResult.assertions[0].name).toBe('test_bar');
    } else {
      throw new Error('Expected pytest result, got: ' + firstResult.kind);
    }
  });

  it('TC5: hook integrates end-to-end — mock backend returning CaseResultPytest yields typed result', async () => {
    /**
     * TC5: End-to-end integration through the hook against a mock backend.
     * Verifies the full path: pytest IOTestCase in → executeCode call → CaseResultPytest out.
     * Catches: wire format mismatch between hook expectation and backend response shape.
     */
    mockApiPost.mockResolvedValueOnce(mockPytestResponse);

    const { result } = renderHook(() => useCaseRunner());

    await act(async () => {
      await result.current.runCases('def add(a,b): return a+b', 'python', [
        {
          kind: 'pytest' as const,
          name: 'test-add',
          target_path: 'tests/test_add.py::test_add',
          test_code: 'def test_add():\n    assert add(1,2) == 3',
        },
      ]);
    });

    // Verify the mock was called with the correct shape (kind=pytest fields sent to backend)
    expect(mockApiPost).toHaveBeenCalledWith('/execute', expect.objectContaining({
      code: 'def add(a,b): return a+b',
      language: 'python',
      cases: expect.arrayContaining([
        expect.objectContaining({ kind: 'pytest', target_path: 'tests/test_add.py::test_add' }),
      ]),
    }));

    // The hook yields the typed CaseResultPytest result
    expect(result.current.results).not.toBeNull();
    const r = result.current.results![0];
    expect(r.kind).toBe('pytest');
    if (r.kind === 'pytest') {
      expect(r.passed).toBe(true);
      expect(typeof r.duration_ms).toBe('number');
    }
  });
});

describe('useCaseRunner — io cases still work', () => {
  beforeEach(() => jest.clearAllMocks());

  it('passes through io results correctly', async () => {
    mockApiPost.mockResolvedValueOnce(mockIoResponse);

    const { result } = renderHook(() => useCaseRunner());

    await act(async () => {
      await result.current.runCases('print("hello")', 'python', [
        { kind: 'io' as const, name: 'io-test', input: '', match_type: 'exact', order: 0 },
      ]);
    });

    expect(result.current.results).not.toBeNull();
    const r = result.current.results![0];
    expect(r.kind).toBe('io');
    if (r.kind === 'io') {
      expect(r.status).toBe('run');
      expect(r.actual).toBe('hello\n');
    }
  });

  it('sets isRunning true during execution, false after', async () => {
    let resolve: (v: unknown) => void;
    mockApiPost.mockImplementationOnce(() => new Promise(r => { resolve = r; }));

    const { result } = renderHook(() => useCaseRunner());

    let promise: Promise<void>;
    act(() => {
      promise = result.current.runCases('code', 'python', []);
    });

    expect(result.current.isRunning).toBe(true);

    await act(async () => {
      resolve!(mockIoResponse);
      await promise;
    });

    expect(result.current.isRunning).toBe(false);
  });
});

describe('useCaseRunner — error handling', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sets error when execution fails', async () => {
    mockApiPost.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useCaseRunner());

    await act(async () => {
      await result.current.runCases('code', 'python', []);
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.isRunning).toBe(false);
    expect(result.current.results).toBeNull();
  });
});

describe('useCaseRunner — mixed cases', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sends mixed io + pytest cases to backend', async () => {
    const mixedResponse = {
      results: [
        { kind: 'io' as const, name: 'io-case', status: 'run', time_ms: 10 } satisfies CaseResultIO,
        { kind: 'pytest' as const, name: 'pytest-case', passed: true, duration_ms: 50, assertions: [] } satisfies CaseResultPytest,
      ],
      summary: { total: 2, passed: 1, failed: 0, errors: 0, run: 1, time_ms: 60 },
    };
    mockApiPost.mockResolvedValueOnce(mixedResponse);

    const { result } = renderHook(() => useCaseRunner());

    await act(async () => {
      await result.current.runCases('code', 'python', [
        { kind: 'io' as const, name: 'io-case', input: '', match_type: 'exact', order: 0 },
        { kind: 'pytest' as const, name: 'pytest-case', target_path: 'tests/t.py::f', test_code: 'def f(): pass' },
      ]);
    });

    expect(result.current.results).toHaveLength(2);
    expect(result.current.results![0].kind).toBe('io');
    expect(result.current.results![1].kind).toBe('pytest');
  });
});
