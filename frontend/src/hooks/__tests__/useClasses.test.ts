/**
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';

const mockApiGet = jest.fn();
const mockApiPost = jest.fn();
const mockApiPatch = jest.fn();
const mockApiDelete = jest.fn();

jest.mock('@/lib/api-client', () => ({
  apiGet: (...args: any[]) => mockApiGet(...args),
  apiPost: (...args: any[]) => mockApiPost(...args),
  apiPatch: (...args: any[]) => mockApiPatch(...args),
  apiDelete: (...args: any[]) => mockApiDelete(...args),
}));

import { useClasses } from '../useClasses';

const fakeClass = {
  id: 'c1',
  namespace_id: 'ns-1',
  name: 'CS 101',
  description: null,
  created_by: 'u1',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const fakeSection = {
  id: 's1',
  namespace_id: 'ns-1',
  class_id: 'c1',
  name: 'Section A',
  semester: 'Fall 2024',
  join_code: 'ABC123',
  active: true,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('useClasses', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetchClasses sets classes on success', async () => {
    mockApiGet.mockResolvedValue({ classes: [fakeClass] });
    const { result } = renderHook(() => useClasses());

    await act(async () => { await result.current.fetchClasses(); });

    expect(result.current.classes).toEqual([fakeClass]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('fetchClasses sets error on failure', async () => {
    mockApiGet.mockRejectedValue(new Error('fail'));
    const { result } = renderHook(() => useClasses());

    await act(async () => { await result.current.fetchClasses(); });

    expect(result.current.error).toBe('fail');
    expect(result.current.loading).toBe(false);
  });

  it('createClass posts and adds to list', async () => {
    mockApiPost.mockResolvedValue({ class: fakeClass });
    const { result } = renderHook(() => useClasses());

    let cls: any;
    await act(async () => { cls = await result.current.createClass('CS 101', 'Intro'); });

    expect(cls).toEqual(fakeClass);
    expect(mockApiPost).toHaveBeenCalledWith('/classes', { name: 'CS 101', description: 'Intro' });
    expect(result.current.classes).toEqual([fakeClass]);
  });

  it('updateClass patches and updates list', async () => {
    mockApiGet.mockResolvedValue({ classes: [fakeClass] });
    const updated = { ...fakeClass, name: 'CS 102' };
    mockApiPatch.mockResolvedValue({ class: updated });
    const { result } = renderHook(() => useClasses());

    // Populate the list first
    await act(async () => { await result.current.fetchClasses(); });

    let cls: any;
    await act(async () => { cls = await result.current.updateClass('c1', { name: 'CS 102' }); });

    expect(cls).toEqual(updated);
    expect(result.current.classes).toEqual([updated]);
  });

  it('deleteClass removes from list', async () => {
    mockApiGet.mockResolvedValue({ classes: [fakeClass] });
    mockApiDelete.mockResolvedValue(undefined);
    const { result } = renderHook(() => useClasses());

    await act(async () => { await result.current.fetchClasses(); });
    await act(async () => { await result.current.deleteClass('c1'); });

    expect(result.current.classes).toEqual([]);
    expect(mockApiDelete).toHaveBeenCalledWith('/classes/c1');
  });

  it('createSection posts to class sections endpoint', async () => {
    mockApiPost.mockResolvedValue({ section: fakeSection });
    const { result } = renderHook(() => useClasses());

    let sec: any;
    await act(async () => { sec = await result.current.createSection('c1', 'Section A', 'Fall 2024'); });

    expect(sec).toEqual(fakeSection);
    expect(mockApiPost).toHaveBeenCalledWith('/classes/c1/sections', { name: 'Section A', semester: 'Fall 2024' });
  });

  it('updateSection patches section', async () => {
    const updated = { ...fakeSection, name: 'Section B' };
    mockApiPatch.mockResolvedValue({ section: updated });
    const { result } = renderHook(() => useClasses());

    let sec: any;
    await act(async () => { sec = await result.current.updateSection('s1', { name: 'Section B' }); });

    expect(sec).toEqual(updated);
    expect(mockApiPatch).toHaveBeenCalledWith('/sections/s1', { name: 'Section B' });
  });

  it('regenerateJoinCode returns new code', async () => {
    mockApiPost.mockResolvedValue({ join_code: 'NEW123' });
    const { result } = renderHook(() => useClasses());

    let code: string = '';
    await act(async () => { code = await result.current.regenerateJoinCode('s1'); });

    expect(code).toBe('NEW123');
    expect(mockApiPost).toHaveBeenCalledWith('/sections/s1/regenerate-code');
  });

  it('addCoInstructor posts email', async () => {
    mockApiPost.mockResolvedValue(undefined);
    const { result } = renderHook(() => useClasses());

    await act(async () => { await result.current.addCoInstructor('s1', 'co@test.com'); });

    expect(mockApiPost).toHaveBeenCalledWith('/sections/s1/instructors', { email: 'co@test.com' });
  });

  it('removeCoInstructor deletes instructor', async () => {
    mockApiDelete.mockResolvedValue(undefined);
    const { result } = renderHook(() => useClasses());

    await act(async () => { await result.current.removeCoInstructor('s1', 'u2'); });

    expect(mockApiDelete).toHaveBeenCalledWith('/sections/s1/instructors/u2');
  });
});
