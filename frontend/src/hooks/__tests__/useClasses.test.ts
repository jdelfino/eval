/**
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';

// Mock the typed API module (not the raw api-client)
const mockListClasses = jest.fn();
const mockCreateClass = jest.fn();
const mockUpdateClass = jest.fn();
const mockDeleteClass = jest.fn();
const mockCreateSection = jest.fn();
const mockUpdateSection = jest.fn();
const mockRegenerateJoinCode = jest.fn();
const mockAddCoInstructor = jest.fn();
const mockRemoveCoInstructor = jest.fn();

jest.mock('@/lib/api/classes', () => ({
  listClasses: (...args: unknown[]) => mockListClasses(...args),
  createClass: (...args: unknown[]) => mockCreateClass(...args),
  updateClass: (...args: unknown[]) => mockUpdateClass(...args),
  deleteClass: (...args: unknown[]) => mockDeleteClass(...args),
  createSection: (...args: unknown[]) => mockCreateSection(...args),
  updateSection: (...args: unknown[]) => mockUpdateSection(...args),
  regenerateJoinCode: (...args: unknown[]) => mockRegenerateJoinCode(...args),
  addCoInstructor: (...args: unknown[]) => mockAddCoInstructor(...args),
  removeCoInstructor: (...args: unknown[]) => mockRemoveCoInstructor(...args),
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
    // Typed API returns plain array (not wrapped)
    mockListClasses.mockResolvedValue([fakeClass]);
    const { result } = renderHook(() => useClasses());

    await act(async () => { await result.current.fetchClasses(); });

    expect(result.current.classes).toEqual([fakeClass]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('fetchClasses sets error on failure', async () => {
    mockListClasses.mockRejectedValue(new Error('fail'));
    const { result } = renderHook(() => useClasses());

    await act(async () => { await result.current.fetchClasses(); });

    expect(result.current.error).toBe('fail');
    expect(result.current.loading).toBe(false);
  });

  it('createClass posts and adds to list', async () => {
    // Typed API returns plain object (not wrapped)
    mockCreateClass.mockResolvedValue(fakeClass);
    const { result } = renderHook(() => useClasses());

    let cls: unknown;
    await act(async () => { cls = await result.current.createClass('CS 101', 'Intro'); });

    expect(cls).toEqual(fakeClass);
    expect(mockCreateClass).toHaveBeenCalledWith('CS 101', 'Intro');
    expect(result.current.classes).toEqual([fakeClass]);
  });

  it('updateClass patches and updates list', async () => {
    mockListClasses.mockResolvedValue([fakeClass]);
    const updated = { ...fakeClass, name: 'CS 102' };
    mockUpdateClass.mockResolvedValue(updated);
    const { result } = renderHook(() => useClasses());

    // Populate the list first
    await act(async () => { await result.current.fetchClasses(); });

    let cls: unknown;
    await act(async () => { cls = await result.current.updateClass('c1', { name: 'CS 102' }); });

    expect(cls).toEqual(updated);
    expect(result.current.classes).toEqual([updated]);
  });

  it('deleteClass removes from list', async () => {
    mockListClasses.mockResolvedValue([fakeClass]);
    mockDeleteClass.mockResolvedValue(undefined);
    const { result } = renderHook(() => useClasses());

    await act(async () => { await result.current.fetchClasses(); });
    await act(async () => { await result.current.deleteClass('c1'); });

    expect(result.current.classes).toEqual([]);
    expect(mockDeleteClass).toHaveBeenCalledWith('c1');
  });

  it('createSection posts to class sections endpoint', async () => {
    mockCreateSection.mockResolvedValue(fakeSection);
    const { result } = renderHook(() => useClasses());

    let sec: unknown;
    await act(async () => { sec = await result.current.createSection('c1', 'Section A', 'Fall 2024'); });

    expect(sec).toEqual(fakeSection);
    expect(mockCreateSection).toHaveBeenCalledWith('c1', 'Section A', 'Fall 2024');
  });

  it('updateSection patches section', async () => {
    const updated = { ...fakeSection, name: 'Section B' };
    mockUpdateSection.mockResolvedValue(updated);
    const { result } = renderHook(() => useClasses());

    let sec: unknown;
    await act(async () => { sec = await result.current.updateSection('s1', { name: 'Section B' }); });

    expect(sec).toEqual(updated);
    expect(mockUpdateSection).toHaveBeenCalledWith('s1', { name: 'Section B' });
  });

  it('regenerateJoinCode returns Section with new code', async () => {
    const updatedSection = { ...fakeSection, join_code: 'NEW123' };
    mockRegenerateJoinCode.mockResolvedValue(updatedSection);
    const { result } = renderHook(() => useClasses());

    let section: unknown;
    await act(async () => { section = await result.current.regenerateJoinCode('s1'); });

    expect(section).toEqual(updatedSection);
    expect(mockRegenerateJoinCode).toHaveBeenCalledWith('s1');
  });

  it('addCoInstructor posts email', async () => {
    mockAddCoInstructor.mockResolvedValue(undefined);
    const { result } = renderHook(() => useClasses());

    await act(async () => { await result.current.addCoInstructor('s1', 'co@test.com'); });

    expect(mockAddCoInstructor).toHaveBeenCalledWith('s1', 'co@test.com');
  });

  it('removeCoInstructor deletes instructor', async () => {
    mockRemoveCoInstructor.mockResolvedValue(undefined);
    const { result } = renderHook(() => useClasses());

    await act(async () => { await result.current.removeCoInstructor('s1', 'u2'); });

    expect(mockRemoveCoInstructor).toHaveBeenCalledWith('s1', 'u2');
  });
});
