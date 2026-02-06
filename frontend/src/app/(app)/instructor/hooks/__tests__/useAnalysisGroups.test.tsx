import { renderHook, act } from '@testing-library/react';
import useAnalysisGroups from '../useAnalysisGroups';
import { WalkthroughScript, AnalysisIssue } from '@/types/analysis';
import * as sessionsApi from '@/lib/api/sessions';

// Mock the sessions API module
jest.mock('@/lib/api/sessions');
const mockAnalyzeSession = sessionsApi.analyzeSession as jest.MockedFunction<typeof sessionsApi.analyzeSession>;

function makeIssue(overrides: Partial<AnalysisIssue> = {}): AnalysisIssue {
  return {
    title: 'Missing base case',
    explanation: 'Students forgot the base case in recursion',
    count: 2,
    student_ids: ['s1', 's2'],
    representative_student_label: 'Student A',
    representative_student_id: 's1',
    severity: 'error',
    ...overrides,
  };
}

function makeScript(issues: AnalysisIssue[]): WalkthroughScript {
  return {
    session_id: 'session-1',
    issues,
    finished_student_ids: ['s1', 's2', 's3'],
    summary: {
      total_submissions: 5,
      filtered_out: 0,
      analyzed_submissions: 5,
      completion_estimate: { finished: 3, in_progress: 1, not_started: 1 },
    },
    overall_note: 'Most students did well overall',
    generated_at: new Date(),
  };
}

function mockSuccessResponse(script: WalkthroughScript) {
  mockAnalyzeSession.mockResolvedValueOnce({ script });
}

function mockErrorResponse(error: string) {
  mockAnalyzeSession.mockRejectedValueOnce(new Error(error));
}

const sampleIssues: AnalysisIssue[] = [
  makeIssue({ title: 'Missing base case', student_ids: ['s1', 's5'], representative_student_id: 's1', severity: 'error', count: 2 }),
  makeIssue({ title: 'Off-by-one error', student_ids: ['s2'], representative_student_id: 's2', severity: 'misconception', count: 1 }),
  makeIssue({ title: 'Good use of helper functions', student_ids: ['s3'], representative_student_id: 's3', severity: 'good-pattern', count: 1 }),
  makeIssue({ title: 'Inconsistent naming', student_ids: ['s4'], representative_student_id: 's4', severity: 'style', count: 1 }),
];

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useAnalysisGroups', () => {
  it('starts in idle state with empty groups', () => {
    const { result } = renderHook(() => useAnalysisGroups());

    expect(result.current.analysisState).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(result.current.script).toBeNull();
    expect(result.current.groups).toEqual([]);
    expect(result.current.activeGroup).toBeNull();
    expect(result.current.activeGroupIndex).toBe(0);
    expect(result.current.overall_note).toBeNull();
    expect(result.current.completion_estimate).toBeNull();
  });

  it('analyze() transitions idle -> loading -> ready and populates groups', async () => {
    const script = makeScript(sampleIssues);
    mockSuccessResponse(script);

    const { result } = renderHook(() => useAnalysisGroups());

    let analyzePromise: Promise<void>;
    act(() => {
      analyzePromise = result.current.analyze('session-1');
    });

    expect(result.current.analysisState).toBe('loading');

    await act(async () => {
      await analyzePromise;
    });

    expect(result.current.analysisState).toBe('ready');
    expect(result.current.script).toEqual(script);
    expect(result.current.groups.length).toBeGreaterThan(0);
    expect(mockAnalyzeSession).toHaveBeenCalledWith('session-1');
  });

  it('groups are ordered: "All Submissions" first, then issues by index', async () => {
    const script = makeScript(sampleIssues);
    mockSuccessResponse(script);

    const { result } = renderHook(() => useAnalysisGroups());

    await act(async () => {
      await result.current.analyze('session-1');
    });

    const groupIds = result.current.groups.map(g => g.id);
    expect(groupIds).toEqual(['all', '0', '1', '2', '3']);

    expect(result.current.groups[0].label).toBe('All Submissions');
    expect(result.current.groups[1].label).toBe('Missing base case');
    expect(result.current.groups[2].label).toBe('Off-by-one error');
  });

  it('each issue group carries the AnalysisIssue object', async () => {
    const script = makeScript(sampleIssues);
    mockSuccessResponse(script);

    const { result } = renderHook(() => useAnalysisGroups());

    await act(async () => {
      await result.current.analyze('session-1');
    });

    expect(result.current.groups[0].issue).toBeUndefined(); // "all" group
    expect(result.current.groups[1].issue).toEqual(sampleIssues[0]);
    expect(result.current.groups[2].issue).toEqual(sampleIssues[1]);
  });

  it('exposes overall_note and completion_estimate from script', async () => {
    const script = makeScript(sampleIssues);
    mockSuccessResponse(script);

    const { result } = renderHook(() => useAnalysisGroups());

    await act(async () => {
      await result.current.analyze('session-1');
    });

    expect(result.current.overall_note).toBe('Most students did well overall');
    expect(result.current.completion_estimate).toEqual({ finished: 3, in_progress: 1, not_started: 1 });
  });

  it('navigateGroup next/prev updates activeGroupIndex with bounds clamping', async () => {
    const script = makeScript(sampleIssues);
    mockSuccessResponse(script);

    const { result } = renderHook(() => useAnalysisGroups());

    await act(async () => {
      await result.current.analyze('session-1');
    });

    expect(result.current.activeGroupIndex).toBe(0);

    act(() => { result.current.navigateGroup('next'); });
    expect(result.current.activeGroupIndex).toBe(1);

    act(() => { result.current.navigateGroup('next'); });
    expect(result.current.activeGroupIndex).toBe(2);

    act(() => { result.current.navigateGroup('prev'); });
    expect(result.current.activeGroupIndex).toBe(1);

    // Clamp at 0
    act(() => { result.current.navigateGroup('prev'); });
    expect(result.current.activeGroupIndex).toBe(0);
    act(() => { result.current.navigateGroup('prev'); });
    expect(result.current.activeGroupIndex).toBe(0);

    // Clamp at end
    const lastIndex = result.current.groups.length - 1;
    act(() => { result.current.setActiveGroupIndex(lastIndex); });
    act(() => { result.current.navigateGroup('next'); });
    expect(result.current.activeGroupIndex).toBe(lastIndex);
  });

  it('dismissGroup removes group, clamps activeGroupIndex, cannot dismiss "all"', async () => {
    const script = makeScript(sampleIssues);
    mockSuccessResponse(script);

    const { result } = renderHook(() => useAnalysisGroups());

    await act(async () => {
      await result.current.analyze('session-1');
    });

    const initialGroupCount = result.current.groups.length;

    // Cannot dismiss 'all'
    act(() => { result.current.dismissGroup('all'); });
    expect(result.current.groups.length).toBe(initialGroupCount);

    // Navigate to last group
    const lastIdx = result.current.groups.length - 1;
    act(() => { result.current.setActiveGroupIndex(lastIdx); });
    expect(result.current.activeGroupIndex).toBe(lastIdx);

    // Dismiss last group - should clamp index
    const lastGroupId = result.current.groups[lastIdx].id;
    act(() => { result.current.dismissGroup(lastGroupId); });
    expect(result.current.groups.length).toBe(initialGroupCount - 1);
    expect(result.current.activeGroupIndex).toBe(result.current.groups.length - 1);

    // Dismiss a middle group
    act(() => { result.current.setActiveGroupIndex(1); });
    const middleGroupId = result.current.groups[1].id;
    act(() => { result.current.dismissGroup(middleGroupId); });
    expect(result.current.groups.find(g => g.id === middleGroupId)).toBeUndefined();
  });

  it('re-analyze resets dismissals and index', async () => {
    const script = makeScript(sampleIssues);
    mockSuccessResponse(script);

    const { result } = renderHook(() => useAnalysisGroups());

    await act(async () => {
      await result.current.analyze('session-1');
    });

    // Dismiss a group and navigate
    act(() => { result.current.dismissGroup('0'); });
    act(() => { result.current.setActiveGroupIndex(2); });

    const dismissedCount = result.current.groups.length;

    // Re-analyze
    mockSuccessResponse(script);
    await act(async () => {
      await result.current.analyze('session-1');
    });

    expect(result.current.activeGroupIndex).toBe(0);
    expect(result.current.groups.length).toBe(dismissedCount + 1);
  });

  it('recommendedStudentId is representative_student_id per issue group', async () => {
    const script = makeScript(sampleIssues);
    mockSuccessResponse(script);

    const { result } = renderHook(() => useAnalysisGroups());

    await act(async () => {
      await result.current.analyze('session-1');
    });

    const allGroup = result.current.groups.find(g => g.id === 'all')!;
    expect(allGroup.recommendedStudentId).toBeNull();
    expect(allGroup.student_ids).toEqual([]);

    const firstIssueGroup = result.current.groups.find(g => g.id === '0')!;
    expect(firstIssueGroup.recommendedStudentId).toBe('s1');
    expect(firstIssueGroup.student_ids).toEqual(['s1', 's5']);

    const secondIssueGroup = result.current.groups.find(g => g.id === '1')!;
    expect(secondIssueGroup.recommendedStudentId).toBe('s2');
  });

  it('error state on fetch failure', async () => {
    mockErrorResponse('Server error');

    const { result } = renderHook(() => useAnalysisGroups());

    await act(async () => {
      await result.current.analyze('session-1');
    });

    expect(result.current.analysisState).toBe('error');
    expect(result.current.error).toBe('Server error');
    expect(result.current.groups).toEqual([]);
  });

  it('activeGroup reflects current activeGroupIndex', async () => {
    const script = makeScript(sampleIssues);
    mockSuccessResponse(script);

    const { result } = renderHook(() => useAnalysisGroups());

    await act(async () => {
      await result.current.analyze('session-1');
    });

    expect(result.current.activeGroup).toBe(result.current.groups[0]);

    act(() => { result.current.setActiveGroupIndex(2); });
    expect(result.current.activeGroup).toBe(result.current.groups[2]);
  });
});
