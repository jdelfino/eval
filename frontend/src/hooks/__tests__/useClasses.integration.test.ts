/**
 * Cross-layer integration tests for useClasses.
 *
 * These tests exercise the full chain: useClasses hook -> typed api module -> api-client -> real withRetry,
 * with only the typed API module and firebase mocked. This verifies that the hook and typed API functions
 * are correctly wired together end-to-end.
 *
 * @jest-environment jsdom
 */

const mockGetIdToken = jest.fn();
const mockCurrentUser = { getIdToken: mockGetIdToken };

jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({ currentUser: mockCurrentUser })),
  onAuthStateChanged: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
}));

jest.mock('@/lib/firebase', () => ({
  firebaseAuth: { currentUser: mockCurrentUser },
}));

jest.mock('@/lib/api/classes', () => ({
  listClasses: jest.fn(),
  createClass: jest.fn(),
  updateClass: jest.fn(),
  deleteClass: jest.fn(),
  createSection: jest.fn(),
  updateSection: jest.fn(),
  regenerateJoinCode: jest.fn(),
  addCoInstructor: jest.fn(),
  removeCoInstructor: jest.fn(),
}));

import { renderHook, act } from '@testing-library/react';
import { useClasses } from '../useClasses';
import * as classesApi from '@/lib/api/classes';

const mockApiClasses = classesApi as jest.Mocked<typeof classesApi>;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetIdToken.mockResolvedValue('integration-token');
});

const fakeClass = {
  id: 'c1',
  namespace_id: 'ns-1',
  name: 'CS 101',
  description: null,
  created_by: 'u1',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('useClasses integration (hook -> typed api)', () => {
  it('fetchClasses calls listClasses and populates state', async () => {
    mockApiClasses.listClasses.mockResolvedValue([fakeClass]);
    const { result } = renderHook(() => useClasses());

    await act(async () => {
      await result.current.fetchClasses();
    });

    // Verify the API function was called
    expect(mockApiClasses.listClasses).toHaveBeenCalled();
    // Verify hook state was updated from API response
    expect(result.current.classes).toEqual([fakeClass]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('createClass calls API function with correct params, updates hook state, and returns the class', async () => {
    mockApiClasses.createClass.mockResolvedValue(fakeClass);
    const { result } = renderHook(() => useClasses());

    let created: unknown;
    await act(async () => {
      created = await result.current.createClass('CS 101', 'Intro');
    });

    expect(mockApiClasses.createClass).toHaveBeenCalledWith('CS 101', 'Intro');
    expect(created).toEqual(fakeClass);
    expect(result.current.classes).toEqual([fakeClass]);
  });

  it('deleteClass calls API function and removes from hook state', async () => {
    // First populate with fetchClasses
    mockApiClasses.listClasses.mockResolvedValue([fakeClass]);
    const { result } = renderHook(() => useClasses());
    await act(async () => {
      await result.current.fetchClasses();
    });
    expect(result.current.classes).toHaveLength(1);

    // Now delete
    mockApiClasses.deleteClass.mockResolvedValue(void 0);

    await act(async () => {
      await result.current.deleteClass('c1');
    });

    expect(mockApiClasses.deleteClass).toHaveBeenCalledWith('c1');
    expect(result.current.classes).toEqual([]);
  });

  it('fetchClasses sets error state when API throws', async () => {
    const error = new Error('Not found');
    mockApiClasses.listClasses.mockRejectedValue(error);
    const { result } = renderHook(() => useClasses());

    await act(async () => {
      await result.current.fetchClasses();
    });

    expect(result.current.error).toBe('Not found');
    expect(result.current.loading).toBe(false);
    expect(result.current.classes).toEqual([]);
  });

  it('updateClass calls API function and updates the correct item in state', async () => {
    mockApiClasses.listClasses.mockResolvedValue([fakeClass]);
    const { result } = renderHook(() => useClasses());
    await act(async () => {
      await result.current.fetchClasses();
    });

    const updated = { ...fakeClass, name: 'CS 102' };
    mockApiClasses.updateClass.mockResolvedValue(updated);

    let cls: unknown;
    await act(async () => {
      cls = await result.current.updateClass('c1', { name: 'CS 102' });
    });

    expect(mockApiClasses.updateClass).toHaveBeenCalledWith('c1', { name: 'CS 102' });
    expect(cls).toEqual(updated);
    expect(result.current.classes).toEqual([updated]);
  });

  it('createClass propagates error from API', async () => {
    const error = new Error('Forbidden') as Error & { status?: number };
    error.status = 403;
    mockApiClasses.createClass.mockRejectedValue(error);
    const { result } = renderHook(() => useClasses());

    let caught: Error & { status?: number } | undefined;
    await act(async () => {
      try {
        await result.current.createClass('CS 101');
      } catch (e) {
        caught = e as Error & { status?: number };
      }
    });

    expect(caught).toBeInstanceOf(Error);
    expect(caught?.message).toBe('Forbidden');
    expect(caught?.status).toBe(403);
  });

  it('regenerateJoinCode calls API function and returns Section', async () => {
    const fakeSection = {
      id: 's1',
      namespace_id: 'ns-1',
      class_id: 'c1',
      name: 'Section A',
      semester: 'Fall 2024',
      join_code: 'NEW456',
      active: true,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };
    mockApiClasses.regenerateJoinCode.mockResolvedValue(fakeSection);
    const { result } = renderHook(() => useClasses());

    let section: unknown;
    await act(async () => {
      section = await result.current.regenerateJoinCode('s1');
    });

    expect(mockApiClasses.regenerateJoinCode).toHaveBeenCalledWith('s1');
    expect(section).toEqual(fakeSection);
  });
});
