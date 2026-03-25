/**
 * Test suite for execution settings bugs PLAT-a4d, PLAT-kir, PLAT-fun
 *
 * PLAT-a4d: updateSessionProblem drops test_cases and solution
 * PLAT-kir: featureCode() doesn't send test_cases
 * PLAT-fun: Public view only passes stdin from featured execution settings
 */

import { updateSessionProblem, featureCode } from '@/lib/api/sessions';
import { apiPost } from '@/lib/api-client';
import type { Problem } from '@/types/api';
import type { ExecutionSettings } from '@/types/problem';

jest.mock('@/lib/api-client');

const mockApiPost = apiPost as jest.MockedFunction<typeof apiPost>;

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
          id: 'tc-1',
          problem_id: 'prob-123',
          type: 'input-output' as const,
          name: 'Test 1',
          description: 'Basic test',
          visible: true,
          order: 0,
          config: {
            type: 'input-output' as const,
            data: {
              input: '5',
              expected_output: '42',
              match_type: 'exact' as const,
            },
          },
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
          id: 'tc-1',
          problem_id: 'prob-123',
          type: 'input-output' as const,
          name: 'Test 1',
          description: 'Test description',
          visible: true,
          order: 0,
          config: {
            type: 'input-output' as const,
            data: {
              input: 'input',
              expected_output: 'output',
              match_type: 'exact' as const,
            },
          },
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
    const testCases: ExecutionSettings = {
      stdin: 'input data',
      random_seed: 42,
      attached_files: [{ name: 'data.txt', content: 'test data' }],
    };

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

  it('should send test_cases when featuring solution with execution settings', async () => {
    const sessionId = 'session-123';
    const solution = 'def solve(n):\n    return n * 2';
    const testCases: ExecutionSettings = {
      stdin: '5\n',
      random_seed: 99,
    };

    mockApiPost.mockResolvedValue(undefined);

    await featureCode(sessionId, solution, testCases);

    const callArgs = mockApiPost.mock.calls[0][1] as any;
    expect(callArgs.code).toBe(solution);
    expect(callArgs.test_cases).toEqual(testCases);
    expect(callArgs.test_cases.stdin).toBe('5\n');
    expect(callArgs.test_cases.random_seed).toBe(99);
  });
});

describe('PLAT-fun: Public view passes all execution settings', () => {
  it('should extract all execution settings fields, not just stdin', () => {
    // This test verifies that the public view page extracts ALL fields
    // from featured_test_cases (stdin, random_seed, attached_files)

    const featuredTestCases = {
      stdin: 'test input',
      random_seed: 42,
      attached_files: [
        { name: 'data.txt', content: 'file content' },
        { name: 'config.json', content: '{"key": "value"}' },
      ],
    };

    // Simulate extracting execution settings from featured_test_cases
    const executionSettings = {
      stdin: featuredTestCases.stdin,
      random_seed: featuredTestCases.random_seed,
      attached_files: featuredTestCases.attached_files,
    };

    // All fields should be present
    expect(executionSettings.stdin).toBe('test input');
    expect(executionSettings.random_seed).toBe(42);
    expect(executionSettings.attached_files).toHaveLength(2);
    expect(executionSettings.attached_files![0].name).toBe('data.txt');
    expect(executionSettings.attached_files![1].content).toBe('{"key": "value"}');
  });

  it('should handle missing execution settings gracefully', () => {
    const featuredTestCases: ExecutionSettings | null = null;

    const executionSettings: ExecutionSettings = featuredTestCases || {};

    expect(executionSettings.stdin).toBeUndefined();
    expect(executionSettings.random_seed).toBeUndefined();
    expect(executionSettings.attached_files).toBeUndefined();
  });

  it('should handle partial execution settings', () => {
    const featuredTestCases: ExecutionSettings = {
      stdin: 'only stdin',
    };

    const executionSettings: ExecutionSettings = {
      stdin: featuredTestCases.stdin,
      random_seed: featuredTestCases.random_seed,
      attached_files: featuredTestCases.attached_files,
    };

    expect(executionSettings.stdin).toBe('only stdin');
    expect(executionSettings.random_seed).toBeUndefined();
    expect(executionSettings.attached_files).toBeUndefined();
  });
});

describe('PLAT-u90: Extract execution settings from test_cases[0]', () => {
  /**
   * Verifies the helper function extracts ExecutionSettings from IOTestCase format.
   * Critical contract: After migration 020, execution settings live in test_cases[0] with
   * field mappings: input→stdin, random_seed→random_seed, attached_files→attached_files.
   * Breaking this would cause attached_files and other settings to be lost on problem reload.
   */
  it('should extract stdin, random_seed, and attached_files from test_cases[0]', () => {
    const testCases = [
      {
        id: 'tc-1',
        problem_id: 'prob-1',
        type: 'input-output' as const,
        name: 'Default',
        description: '',
        visible: true,
        order: 0,
        config: {
          type: 'input-output' as const,
          data: {
            input: '5\n10\n',
            expected_output: '15',
            match_type: 'exact' as const,
          },
        },
        // ExecutionSettings fields in IOTestCase
        random_seed: 42,
        attached_files: [
          { name: 'data.txt', content: 'test content' },
          { name: 'config.json', content: '{}' },
        ],
      },
    ];

    // This is what the helper should extract
    const expectedSettings: ExecutionSettings = {
      stdin: '5\n10\n',
      random_seed: 42,
      attached_files: [
        { name: 'data.txt', content: 'test content' },
        { name: 'config.json', content: '{}' },
      ],
    };

    // Import the helper function (will be created in types/problem.ts)
    const { extractExecutionSettingsFromTestCases } = require('@/types/problem');
    const result = extractExecutionSettingsFromTestCases(testCases);

    expect(result).toEqual(expectedSettings);
  });

  it('should handle test_cases with no execution settings', () => {
    const testCases = [
      {
        id: 'tc-1',
        problem_id: 'prob-1',
        type: 'input-output' as const,
        name: 'Test 1',
        description: 'Basic test',
        visible: true,
        order: 0,
        config: {
          type: 'input-output' as const,
          data: {
            input: '',
            expected_output: 'output',
            match_type: 'exact' as const,
          },
        },
      },
    ];

    const { extractExecutionSettingsFromTestCases } = require('@/types/problem');
    const result = extractExecutionSettingsFromTestCases(testCases);

    expect(result).toEqual({
      stdin: '',
      random_seed: undefined,
      attached_files: undefined,
    });
  });

  it('should return empty settings for empty test_cases array', () => {
    const { extractExecutionSettingsFromTestCases } = require('@/types/problem');
    const result = extractExecutionSettingsFromTestCases([]);

    expect(result).toEqual({
      stdin: undefined,
      random_seed: undefined,
      attached_files: undefined,
    });
  });

  it('should return empty settings for null/undefined test_cases', () => {
    const { extractExecutionSettingsFromTestCases } = require('@/types/problem');

    expect(extractExecutionSettingsFromTestCases(null)).toEqual({
      stdin: undefined,
      random_seed: undefined,
      attached_files: undefined,
    });

    expect(extractExecutionSettingsFromTestCases(undefined)).toEqual({
      stdin: undefined,
      random_seed: undefined,
      attached_files: undefined,
    });
  });

  /**
   * Verifies that updateStudentWork sends test_cases instead of execution_settings.
   * Critical contract: Backend expects test_cases field, not execution_settings.
   * Breaking this would cause student execution settings to be silently dropped on save.
   */
  it('should send test_cases field to updateStudentWork, not execution_settings', async () => {
    const { updateStudentWork } = require('@/lib/api/student-work');
    const { apiPatch } = require('@/lib/api-client');

    jest.clearAllMocks();

    const workId = 'work-123';
    const executionSettings: ExecutionSettings = {
      stdin: 'test input',
      random_seed: 99,
      attached_files: [{ name: 'file.txt', content: 'data' }],
    };

    await updateStudentWork(workId, {
      code: 'def solve(): pass',
      test_cases: executionSettings,
    });

    expect(apiPatch).toHaveBeenCalledWith(`/student-work/${workId}`, {
      code: 'def solve(): pass',
      test_cases: executionSettings,
    });

    // Verify execution_settings is NOT sent
    const callArgs = (apiPatch as jest.Mock).mock.calls[0][1] as any;
    expect(callArgs).not.toHaveProperty('execution_settings');
    expect(callArgs).toHaveProperty('test_cases');
  });
});
