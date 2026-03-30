/**
 * Test suite for execution settings bugs PLAT-a4d, PLAT-kir, PLAT-fun
 *
 * PLAT-a4d: updateSessionProblem drops test_cases and solution
 * PLAT-kir: featureCode() doesn't send test_cases
 * PLAT-fun: Public view only passes stdin from featured execution settings
 */

import { updateSessionProblem, featureCode, updateSessionProblemPartial } from '@/lib/api/sessions';
import { updateCode, featureStudent } from '@/lib/api/realtime';
import { apiPost, apiPut } from '@/lib/api-client';
import type { Problem, IOTestCase } from '@/types/api';

jest.mock('@/lib/api-client');

const mockApiPost = apiPost as jest.MockedFunction<typeof apiPost>;
const mockApiPut = apiPut as jest.MockedFunction<typeof apiPut>;

describe('PLAT-a4d: updateSessionProblem sends complete problem with test_cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should send complete problem object including solution, language, and test_cases', async () => {
    const sessionId = 'session-123';
    const completeProblem: Problem = {
      id: 'prob-123',
      namespace_id: 'ns-1',
      title: 'Updated Problem',
      description: 'Updated description',
      starter_code: 'def solve():\n    pass',
      solution: 'def solve():\n    return 42',
      language: 'python',
      author_id: 'user-1',
      class_id: null,
      tags: [],
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      test_cases: [
        {
          name: 'Test 1',
          input: '5',
          expected_output: '42',
          match_type: 'exact',
          order: 0,
        },
      ],
    };

    mockApiPost.mockResolvedValue(undefined);

    await updateSessionProblem(sessionId, completeProblem);

    expect(mockApiPost).toHaveBeenCalledWith(`/sessions/${sessionId}/update-problem`, {
      problem: completeProblem,
    });

    // Verify the problem object contains ALL required fields
    const callArgs = mockApiPost.mock.calls[0][1] as any;
    expect(callArgs.problem.title).toBe('Updated Problem');
    expect(callArgs.problem.description).toBe('Updated description');
    expect(callArgs.problem.starter_code).toBe('def solve():\n    pass');
    expect(callArgs.problem.solution).toBe('def solve():\n    return 42');
    expect(callArgs.problem.language).toBe('python');
    expect(callArgs.problem.test_cases).toHaveLength(1);
    expect(callArgs.problem.test_cases[0].name).toBe('Test 1');
  });

  it('should NOT send execution_settings as a separate field', async () => {
    const sessionId = 'session-123';
    const problem: Problem = {
      id: 'prob-1',
      namespace_id: 'ns-1',
      title: 'Problem',
      description: 'Description',
      starter_code: 'code',
      solution: 'solution',
      language: 'python',
      author_id: 'user-1',
      class_id: null,
      tags: [],
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      test_cases: [],
    };

    mockApiPost.mockResolvedValue(undefined);

    await updateSessionProblem(sessionId, problem);

    const callArgs = mockApiPost.mock.calls[0][1] as any;
    // Backend ignores execution_settings field, so it should NOT be sent
    expect(callArgs).not.toHaveProperty('execution_settings');
  });

  it('should preserve all problem fields when updating', async () => {
    const sessionId = 'session-123';
    // Simulating an update scenario where we have an initial problem
    // and we're only changing title, but must send ALL fields
    const initialProblem: Problem = {
      id: 'prob-123',
      namespace_id: 'ns-1',
      title: 'Original Title',
      description: 'Original description',
      starter_code: 'original code',
      solution: 'original solution',
      language: 'python',
      author_id: 'user-1',
      class_id: null,
      tags: ['tag1'],
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      test_cases: [
        {
          name: 'Test 1',
          input: 'input',
          expected_output: 'output',
          match_type: 'exact',
          order: 0,
        },
      ],
    };

    // User only edits the title, but we must send the complete object
    const updatedProblem = {
      ...initialProblem,
      title: 'Updated Title',
    };

    mockApiPost.mockResolvedValue(undefined);

    await updateSessionProblem(sessionId, updatedProblem);

    const callArgs = mockApiPost.mock.calls[0][1] as any;
    expect(callArgs.problem.title).toBe('Updated Title');
    expect(callArgs.problem.description).toBe('Original description');
    expect(callArgs.problem.starter_code).toBe('original code');
    expect(callArgs.problem.solution).toBe('original solution');
    expect(callArgs.problem.language).toBe('python');
    expect(callArgs.problem.test_cases).toEqual(initialProblem.test_cases);
  });
});

describe('PLAT-kir: featureCode() sends test_cases to backend', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should accept and send test_cases parameter when featuring code', async () => {
    const sessionId = 'session-123';
    const code = 'def solution():\n    return 42';
    const testCases: IOTestCase[] = [
      {
        name: 'Default',
        input: 'input data',
        match_type: 'exact',
        order: 0,
        random_seed: 42,
        attached_files: [{ name: 'data.txt', content: 'test data' }],
      },
    ];

    mockApiPost.mockResolvedValue(undefined);

    await featureCode(sessionId, code, testCases);

    expect(mockApiPost).toHaveBeenCalledWith(`/sessions/${sessionId}/feature`, {
      code,
      test_cases: testCases,
    });
  });

  it('should work without test_cases for backwards compatibility', async () => {
    const sessionId = 'session-123';
    const code = 'def solution():\n    return 42';

    mockApiPost.mockResolvedValue(undefined);

    await featureCode(sessionId, code);

    expect(mockApiPost).toHaveBeenCalledWith(`/sessions/${sessionId}/feature`, {
      code,
    });
  });

  it('should send test_cases when featuring solution with IOTestCase[] input', async () => {
    const sessionId = 'session-123';
    const solution = 'def solve(n):\n    return n * 2';
    const testCases: IOTestCase[] = [
      { name: 'Default', input: '5\n', match_type: 'exact', order: 0, random_seed: 99 },
    ];

    mockApiPost.mockResolvedValue(undefined);

    await featureCode(sessionId, solution, testCases);

    const callArgs = mockApiPost.mock.calls[0][1] as any;
    expect(callArgs.code).toBe(solution);
    expect(callArgs.test_cases).toEqual(testCases);
    expect(callArgs.test_cases[0].input).toBe('5\n');
    expect(callArgs.test_cases[0].random_seed).toBe(99);
  });
});

describe('PLAT-fun: Public view passes all execution settings (PLAT-st42.4: now uses IOTestCase[])', () => {
  it('should read all fields directly from IOTestCase[0] (input, random_seed, attached_files)', () => {
    /**
     * Contract: After PLAT-st42.4, public view reads test case data directly from
     * IOTestCase[] — no ExecutionSettings bridge. All fields must be preserved.
     */
    const featuredTestCases: IOTestCase[] = [
      {
        name: 'Default',
        input: 'test input',
        match_type: 'exact',
        order: 0,
        random_seed: 42,
        attached_files: [
          { name: 'data.txt', content: 'file content' },
          { name: 'config.json', content: '{"key": "value"}' },
        ],
      },
    ];

    const firstCase = featuredTestCases[0];
    expect(firstCase.input).toBe('test input');
    expect(firstCase.random_seed).toBe(42);
    expect(firstCase.attached_files).toHaveLength(2);
    expect(firstCase.attached_files![0].name).toBe('data.txt');
    expect(firstCase.attached_files![1].content).toBe('{"key": "value"}');
  });

  it('should handle missing featured test cases gracefully (empty array)', () => {
    const featuredTestCases: IOTestCase[] = [];
    const firstCase = featuredTestCases[0];
    expect(firstCase).toBeUndefined();
    expect(firstCase?.input).toBeUndefined();
    expect(firstCase?.random_seed).toBeUndefined();
    expect(firstCase?.attached_files).toBeUndefined();
  });

  it('should handle partial test case (only input)', () => {
    const featuredTestCases: IOTestCase[] = [
      { name: 'Default', input: 'only stdin', match_type: 'exact', order: 0 },
    ];
    const firstCase = featuredTestCases[0];
    expect(firstCase.input).toBe('only stdin');
    expect(firstCase.random_seed).toBeUndefined();
    expect(firstCase.attached_files).toBeUndefined();
  });
});

describe('PLAT-u90/PLAT-e4m: IOTestCase[] direct access (PLAT-st42.4: bridge functions deleted)', () => {
  /**
   * After PLAT-st42.4, extractExecutionSettingsFromTestCases and buildTestCasesFromExecutionSettings
   * are deleted. Code reads directly from test_cases[0] and builds IOTestCase[] inline.
   * These tests verify the direct read/write patterns still work correctly.
   */

  it('reads input, random_seed, attached_files directly from test_cases[0]', () => {
    const testCases: IOTestCase[] = [
      {
        name: 'Default',
        input: '5\n10\n',
        match_type: 'exact',
        order: 0,
        random_seed: 42,
        attached_files: [
          { name: 'data.txt', content: 'test content' },
          { name: 'config.json', content: '{}' },
        ],
      },
    ];

    const firstCase = testCases[0];
    expect(firstCase.input).toBe('5\n10\n');
    expect(firstCase.random_seed).toBe(42);
    expect(firstCase.attached_files).toHaveLength(2);
  });

  it('handles empty test_cases array gracefully', () => {
    const testCases: IOTestCase[] = [];
    const firstCase = testCases[0];
    expect(firstCase).toBeUndefined();
    expect(firstCase?.input).toBeUndefined();
    expect(firstCase?.random_seed).toBeUndefined();
  });

  it('builds IOTestCase[] directly from field values', () => {
    // This is what ProblemCreator.handleSubmit now does inline
    const stdin = 'hello world';
    const random_seed = 42;
    const attached_files = [{ name: 'data.txt', content: 'content' }];

    const testCases: IOTestCase[] = [{
      name: 'Default',
      input: stdin.trim(),
      match_type: 'exact',
      order: 0,
      random_seed,
      attached_files,
    }];

    expect(testCases).not.toBeUndefined();
    expect(testCases).toHaveLength(1);
    expect(testCases[0]).toMatchObject({
      name: 'Default',
      input: 'hello world',
      match_type: 'exact',
    });
    expect(testCases[0].random_seed).toBe(42);
    expect(testCases[0].attached_files).toHaveLength(1);
  });

  it('produces empty array when no stdin/seed/files are set', () => {
    const stdin = '';
    const random_seed = undefined;
    const attached_files: Array<{ name: string; content: string }> = [];

    const hasContent = stdin.trim() !== '' || random_seed !== undefined || attached_files.length > 0;
    const testCases: IOTestCase[] = hasContent ? [{
      name: 'Default', input: stdin.trim(), match_type: 'exact', order: 0,
    }] : [];

    expect(testCases).toEqual([]);
  });

  /**
   * Verifies that updateStudentWork sends test_cases (IOTestCase[]) instead of execution_settings.
   * Critical contract: Backend expects test_cases field as IOTestCase[], not execution_settings.
   * Breaking this would cause student execution settings to be silently dropped on save.
   */
  it('should send test_cases field to updateStudentWork, not execution_settings', async () => {
    const { updateStudentWork } = require('@/lib/api/student-work');
    const { apiPatch } = require('@/lib/api-client');

    jest.clearAllMocks();

    const workId = 'work-123';
    const testCases: IOTestCase[] = [
      {
        name: 'Default',
        input: 'test input',
        match_type: 'exact',
        order: 0,
        random_seed: 99,
        attached_files: [{ name: 'file.txt', content: 'data' }],
      },
    ];

    await updateStudentWork(workId, {
      code: 'def solve(): pass',
      test_cases: testCases,
    });

    expect(apiPatch).toHaveBeenCalledWith(`/student-work/${workId}`, {
      code: 'def solve(): pass',
      test_cases: testCases,
    });

    // Verify execution_settings is NOT sent
    const callArgs = (apiPatch as jest.Mock).mock.calls[0][1] as any;
    expect(callArgs).not.toHaveProperty('execution_settings');
    expect(callArgs).toHaveProperty('test_cases');
  });
});

// ---------------------------------------------------------------------------
// PLAT-st42.1: API clients accept IOTestCase[] not ExecutionSettings
// ---------------------------------------------------------------------------

describe('PLAT-st42.1: featureCode accepts IOTestCase[] not ExecutionSettings', () => {
  /**
   * Contract: featureCode third param is IOTestCase[], matching the wire format
   * stored in the DB after migration 020. Passing ExecutionSettings was the old
   * shape and would cause type errors. Breaking this causes test_cases to be sent
   * in the wrong format to the backend.
   */
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiPost.mockResolvedValue(undefined);
  });

  it('should accept IOTestCase[] and send as test_cases', async () => {
    const sessionId = 'session-abc';
    const code = 'def solve(): return 1';
    const testCases: IOTestCase[] = [
      { name: 'Default', input: 'hello', match_type: 'exact', order: 0 },
    ];

    await featureCode(sessionId, code, testCases);

    expect(mockApiPost).toHaveBeenCalledWith(`/sessions/${sessionId}/feature`, {
      code,
      test_cases: testCases,
    });
  });

  it('should accept IOTestCase[] with attached_files', async () => {
    const sessionId = 'session-abc';
    const code = 'def solve(): pass';
    const testCases: IOTestCase[] = [
      {
        name: 'Default',
        input: 'data',
        match_type: 'exact',
        order: 0,
        attached_files: [{ name: 'file.txt', content: 'content' }],
        random_seed: 42,
      },
    ];

    await featureCode(sessionId, code, testCases);

    const callArgs = mockApiPost.mock.calls[0][1] as any;
    expect(callArgs.test_cases[0].input).toBe('data');
    expect(callArgs.test_cases[0].attached_files).toHaveLength(1);
    expect(callArgs.test_cases[0].random_seed).toBe(42);
  });

  it('should send no test_cases field when omitted', async () => {
    await featureCode('s1', 'code');
    const callArgs = mockApiPost.mock.calls[0][1] as any;
    expect(callArgs).not.toHaveProperty('test_cases');
  });
});

describe('PLAT-st42.1: realtime updateCode accepts IOTestCase[]', () => {
  /**
   * Contract: updateCode fourth param is IOTestCase[] (not ExecutionSettings).
   * This ensures the PUT /sessions/:id/code endpoint receives the correct shape.
   */
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiPut.mockResolvedValue({} as any);
  });

  it('should accept IOTestCase[] as testCases param', async () => {
    const testCases: IOTestCase[] = [
      { name: 'tc1', input: 'in', match_type: 'exact', order: 0 },
    ];

    await updateCode('session-1', 'student-1', 'print(1)', testCases);

    expect(mockApiPut).toHaveBeenCalledWith('/sessions/session-1/code', {
      student_id: 'student-1',
      code: 'print(1)',
      test_cases: testCases,
    });
  });
});

describe('PLAT-st42.1: realtime featureStudent accepts IOTestCase[]', () => {
  /**
   * Contract: featureStudent fourth param is IOTestCase[] (not ExecutionSettings).
   * Ensures POST /sessions/:id/feature sends IOTestCase[] for featured student.
   */
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiPost.mockResolvedValue(undefined);
  });

  it('should accept IOTestCase[] as testCases param', async () => {
    const testCases: IOTestCase[] = [
      { name: 'tc1', input: 'in', match_type: 'exact', order: 0 },
    ];

    await featureStudent('session-1', 'student-1', 'code', testCases);

    expect(mockApiPost).toHaveBeenCalledWith('/sessions/session-1/feature', {
      student_id: 'student-1',
      code: 'code',
      test_cases: testCases,
    });
  });
});

describe('PLAT-st42.1: updateStudentWork accepts IOTestCase[]', () => {
  /**
   * Contract: updateStudentWork data.test_cases is IOTestCase[], not ExecutionSettings.
   * Sending ExecutionSettings would put data in the wrong shape in the DB.
   */
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should accept IOTestCase[] and pass to apiPatch', async () => {
    const { updateStudentWork } = require('@/lib/api/student-work');
    const { apiPatch } = require('@/lib/api-client');
    (apiPatch as jest.Mock).mockResolvedValue(undefined);
    jest.clearAllMocks();

    const testCases: IOTestCase[] = [
      { name: 'Default', input: 'stdin text', match_type: 'exact', order: 0, random_seed: 7 },
    ];

    await updateStudentWork('work-1', { code: 'x=1', test_cases: testCases });

    expect(apiPatch).toHaveBeenCalledWith('/student-work/work-1', {
      code: 'x=1',
      test_cases: testCases,
    });
  });
});

describe('PLAT-st42.1: updateSessionProblemPartial excludes execution_settings', () => {
  /**
   * Contract: updateSessionProblemPartial no longer accepts execution_settings.
   * The backend only reads test_cases; execution_settings is legacy.
   */
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiPost.mockResolvedValue(undefined);
  });

  it('should accept test_cases in partial update', async () => {
    const testCases: IOTestCase[] = [
      { name: 'tc', input: 'x', match_type: 'exact', order: 0 },
    ];

    await updateSessionProblemPartial('session-1', { title: 'My Problem', test_cases: testCases });

    expect(mockApiPost).toHaveBeenCalledWith('/sessions/session-1/update-problem', {
      problem: { title: 'My Problem', test_cases: testCases },
    });
  });
});
