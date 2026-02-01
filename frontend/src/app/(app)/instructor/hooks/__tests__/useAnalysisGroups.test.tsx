import { renderHook, act } from '@testing-library/react';
import useAnalysisGroups from '../useAnalysisGroups';
import { WalkthroughScript, AnalysisIssue } from '@/server/types/analysis';

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

function makeIssue(overrides: Partial<AnalysisIssue> = {}): AnalysisIssue {
  return {
    title: 'Missing base case',
    explanation: 'Students forgot the base case in recursion',
    count: 2,
    studentIds: ['s1', 's2'],
    representativeStudentLabel: 'Student A',
    representativeStudentId: 's1',
    severity: 'error',
    ...overrides,
  };
}

function makeScript(issues: AnalysisIssue[]): WalkthroughScript {
  return {
    sessionId: 'session-1',
    issues,
    finishedStudentIds: ['s1', 's2', 's3'],
    summary: {
      totalSubmissions: 5,
      filteredOut: 0,
      analyzedSubmissions: 5,
      completionEstimate: { finished: 3, inProgress: 1, notStarted: 1 },
    },
    overallNote: 'Most students did well overall',
    generatedAt: new Date(),
  };
}

function mockSuccessResponse(script: WalkthroughScript) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ script }),
  });
}

function mockErrorResponse(error: string) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    json: async () => ({ error }),
  });
}

const sampleIssues: AnalysisIssue[] = [
  makeIssue({ title: 'Missing base case', studentIds: ['s1', 's5'], representativeStudentId: 's1', severity: 'error', count: 2 }),
  makeIssue({ title: 'Off-by-one error', studentIds: ['s2'], representativeStudentId: 's2', severity: 'misconception', count: 1 }),
  makeIssue({ title: 'Good use of helper functions', studentIds: ['s3'], representativeStudentId: 's3', severity: 'good-pattern', count: 1 }),
  makeIssue({ title: 'Inconsistent naming', studentIds: ['s4'], representativeStudentId: 's4', severity: 'style', count: 1 }),
];

beforeEach(() => {
  mockFetch.mockReset();
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
    expect(result.current.overallNote).toBeNull();
    expect(result.current.completionEstimate).toBeNull();
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
    expect(mockFetch).toHaveBeenCalledWith('/api/sessions/session-1/analyze', { method: 'POST' });
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

  it('exposes overallNote and completionEstimate from script', async () => {
    const script = makeScript(sampleIssues);
    mockSuccessResponse(script);

    const { result } = renderHook(() => useAnalysisGroups());

    await act(async () => {
      await result.current.analyze('session-1');
    });

    expect(result.current.overallNote).toBe('Most students did well overall');
    expect(result.current.completionEstimate).toEqual({ finished: 3, inProgress: 1, notStarted: 1 });
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

  it('recommendedStudentId is representativeStudentId per issue group', async () => {
    const script = makeScript(sampleIssues);
    mockSuccessResponse(script);

    const { result } = renderHook(() => useAnalysisGroups());

    await act(async () => {
      await result.current.analyze('session-1');
    });

    const allGroup = result.current.groups.find(g => g.id === 'all')!;
    expect(allGroup.recommendedStudentId).toBeNull();
    expect(allGroup.studentIds).toEqual([]);

    const firstIssueGroup = result.current.groups.find(g => g.id === '0')!;
    expect(firstIssueGroup.recommendedStudentId).toBe('s1');
    expect(firstIssueGroup.studentIds).toEqual(['s1', 's5']);

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
