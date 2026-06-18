/**
 * @jest-environment jsdom
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useProblemPublishState } from '../useProblemPublishState';
import * as sectionProblemsApi from '@/lib/api/section-problems';

jest.mock('@/lib/api/section-problems');

const mockList = sectionProblemsApi.listProblemSections as jest.Mock;

describe('useProblemPublishState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('unpublished section → not published, showSolutionArg follows the toggle', async () => {
    mockList.mockResolvedValueOnce([]); // problem not published anywhere

    const { result } = renderHook(() => useProblemPublishState('prob-1', 'sec-1'));

    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.isPublished).toBe(false);
    // Default toggle off → force-publish with show_solution=false.
    expect(result.current.showSolutionArg).toBe(false);

    act(() => result.current.setShowSolution(true));
    expect(result.current.showSolution).toBe(true);
    expect(result.current.showSolutionArg).toBe(true);
  });

  it('published section → isPublished true and showSolutionArg undefined', async () => {
    mockList.mockResolvedValueOnce([
      { id: 'sp-1', section_id: 'sec-1', problem_id: 'prob-1', published_by: 'u', show_solution: false, published_at: 'x' },
    ]);

    const { result } = renderHook(() => useProblemPublishState('prob-1', 'sec-1'));

    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.isPublished).toBe(true);
    // Already published → never send show_solution.
    expect(result.current.showSolutionArg).toBeUndefined();
  });

  it('no problem (blank session) → not loaded, no fetch, undefined arg', async () => {
    const { result } = renderHook(() => useProblemPublishState(null, 'sec-1'));

    expect(mockList).not.toHaveBeenCalled();
    expect(result.current.isPublished).toBe(false);
    expect(result.current.showSolutionArg).toBeUndefined();
  });

  it('resets showSolution when the section changes', async () => {
    mockList.mockResolvedValue([]);

    const { result, rerender } = renderHook(
      ({ p, s }) => useProblemPublishState(p, s),
      { initialProps: { p: 'prob-1', s: 'sec-1' } }
    );
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => result.current.setShowSolution(true));
    expect(result.current.showSolution).toBe(true);

    rerender({ p: 'prob-1', s: 'sec-2' });
    expect(result.current.showSolution).toBe(false);
  });
});
