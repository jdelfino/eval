/**
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';

const mockApiGet = jest.fn();
const mockApiPost = jest.fn();
const mockApiDelete = jest.fn();

jest.mock('@/lib/api-client', () => ({
  apiGet: (...args: any[]) => mockApiGet(...args),
  apiPost: (...args: any[]) => mockApiPost(...args),
  apiDelete: (...args: any[]) => mockApiDelete(...args),
}));

import { useSections } from '../useSections';

const fakeSection = {
  id: 's1',
  namespace_id: 'ns-1',
  class_id: 'c1',
  name: 'Section A',
  semester: 'Fall 2024',
  join_code: 'ABC',
  active: true,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  className: 'CS 101',
  classDescription: 'Intro',
  role: 'student' as const,
};

describe('useSections', () => {
  beforeEach(() => jest.clearAllMocks());

  it('starts with loading true', () => {
    const { result } = renderHook(() => useSections());
    expect(result.current.loading).toBe(true);
  });

  it('fetchMySections sets sections on success', async () => {
    mockApiGet.mockResolvedValue({ sections: [fakeSection] });
    const { result } = renderHook(() => useSections());

    await act(async () => { await result.current.fetchMySections(); });

    expect(result.current.sections).toEqual([fakeSection]);
    expect(result.current.loading).toBe(false);
    expect(mockApiGet).toHaveBeenCalledWith('/sections/my');
  });

  it('fetchMySections sets error on failure', async () => {
    mockApiGet.mockRejectedValue(new Error('fail'));
    const { result } = renderHook(() => useSections());

    await act(async () => { await result.current.fetchMySections(); });

    expect(result.current.error).toBe('fail');
    expect(result.current.loading).toBe(false);
  });

  it('joinSection posts and refreshes sections', async () => {
    const joinedSection = { ...fakeSection, id: 's2' };
    mockApiPost.mockResolvedValue({ section: joinedSection });
    mockApiGet.mockResolvedValue({ sections: [fakeSection, { ...fakeSection, id: 's2' }] });
    const { result } = renderHook(() => useSections());

    let sec: any;
    await act(async () => { sec = await result.current.joinSection('CODE'); });

    expect(sec).toEqual(joinedSection);
    expect(mockApiPost).toHaveBeenCalledWith('/sections/join', { join_code: 'CODE' });
    expect(mockApiGet).toHaveBeenCalledWith('/sections/my');
  });

  it('leaveSection removes section from list', async () => {
    mockApiGet.mockResolvedValue({ sections: [fakeSection] });
    mockApiDelete.mockResolvedValue(undefined);
    const { result } = renderHook(() => useSections());

    await act(async () => { await result.current.fetchMySections(); });
    await act(async () => { await result.current.leaveSection('s1'); });

    expect(result.current.sections).toEqual([]);
    expect(mockApiDelete).toHaveBeenCalledWith('/sections/s1/leave');
  });

  it('getActiveSessions returns only active sessions', async () => {
    mockApiGet.mockResolvedValue({
      sessions: [
        { id: 'sess1', status: 'active' },
        { id: 'sess2', status: 'completed' },
        { id: 'sess3', status: 'active' },
      ],
    });
    const { result } = renderHook(() => useSections());

    let sessions: any;
    await act(async () => { sessions = await result.current.getActiveSessions('s1'); });

    expect(sessions).toEqual([
      { id: 'sess1', status: 'active' },
      { id: 'sess3', status: 'active' },
    ]);
    expect(mockApiGet).toHaveBeenCalledWith('/sections/s1/sessions');
  });
});
