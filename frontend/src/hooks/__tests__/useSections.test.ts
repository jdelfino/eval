/**
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';

const mockListMySections = jest.fn();
const mockJoinSection = jest.fn();
const mockLeaveSection = jest.fn();
const mockGetActiveSessions = jest.fn();

jest.mock('@/lib/api/sections', () => ({
  listMySections: (...args: unknown[]) => mockListMySections(...args),
  joinSection: (...args: unknown[]) => mockJoinSection(...args),
  leaveSection: (...args: unknown[]) => mockLeaveSection(...args),
  getActiveSessions: (...args: unknown[]) => mockGetActiveSessions(...args),
}));

import { useSections } from '../useSections';
import type { MySectionInfo, SectionMembership } from '@/types/api';

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
};

const fakeMySectionInfo: MySectionInfo = {
  section: fakeSection,
  class_name: 'CS 101',
};

describe('useSections', () => {
  beforeEach(() => jest.clearAllMocks());

  it('starts with loading true', () => {
    const { result } = renderHook(() => useSections());
    expect(result.current.loading).toBe(true);
  });

  it('fetchMySections sets sections on success', async () => {
    mockListMySections.mockResolvedValue([fakeMySectionInfo]);
    const { result } = renderHook(() => useSections());

    await act(async () => { await result.current.fetchMySections(); });

    expect(result.current.sections).toEqual([fakeMySectionInfo]);
    expect(result.current.loading).toBe(false);
    expect(mockListMySections).toHaveBeenCalled();
  });

  it('fetchMySections sets error on failure', async () => {
    mockListMySections.mockRejectedValue(new Error('fail'));
    const { result } = renderHook(() => useSections());

    await act(async () => { await result.current.fetchMySections(); });

    expect(result.current.error).toBe('fail');
    expect(result.current.loading).toBe(false);
  });

  it('joinSection calls API and refreshes sections', async () => {
    const joinedMembership: SectionMembership = {
      id: 'mem-1',
      user_id: 'u1',
      section_id: 's2',
      role: 'student',
      joined_at: '2024-01-01T00:00:00Z',
    };
    const newMySectionInfo: MySectionInfo = {
      section: { ...fakeSection, id: 's2' },
      class_name: 'CS 101',
    };
    mockJoinSection.mockResolvedValue(joinedMembership);
    mockListMySections.mockResolvedValue([fakeMySectionInfo, newMySectionInfo]);
    const { result } = renderHook(() => useSections());

    let membership: SectionMembership | undefined;
    await act(async () => { membership = await result.current.joinSection('CODE'); });

    expect(membership).toEqual(joinedMembership);
    expect(mockJoinSection).toHaveBeenCalledWith('CODE');
    expect(mockListMySections).toHaveBeenCalled();
  });

  it('leaveSection removes section from list', async () => {
    mockListMySections.mockResolvedValue([fakeMySectionInfo]);
    mockLeaveSection.mockResolvedValue(undefined);
    const { result } = renderHook(() => useSections());

    await act(async () => { await result.current.fetchMySections(); });
    await act(async () => { await result.current.leaveSection('s1'); });

    expect(result.current.sections).toEqual([]);
    expect(mockLeaveSection).toHaveBeenCalledWith('s1');
  });

  it('getActiveSessions returns only active sessions', async () => {
    mockGetActiveSessions.mockResolvedValue([
      { id: 'sess1', status: 'active' },
      { id: 'sess2', status: 'completed' },
      { id: 'sess3', status: 'active' },
    ]);
    const { result } = renderHook(() => useSections());

    let sessions: unknown;
    await act(async () => { sessions = await result.current.getActiveSessions('s1'); });

    expect(sessions).toEqual([
      { id: 'sess1', status: 'active' },
      { id: 'sess3', status: 'active' },
    ]);
    expect(mockGetActiveSessions).toHaveBeenCalledWith('s1');
  });
});
