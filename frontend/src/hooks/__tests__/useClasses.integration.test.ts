/**
 * Cross-layer integration tests for useClasses.
 *
 * These tests exercise the full chain: useClasses hook -> typed api module -> api-client -> real withRetry,
 * with only global.fetch and firebase mocked. This verifies that the hook, typed API functions, api-client,
 * and retry logic are correctly wired together end-to-end.
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

import { renderHook, act } from '@testing-library/react';
import { useClasses } from '../useClasses';

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn();
  mockGetIdToken.mockResolvedValue('integration-token');
});

function mockFetchOk(data: unknown) {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
  });
}

function mockFetchError(status: number, errorMsg: string) {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({ error: errorMsg }),
  });
}

const fakeClass = {
  id: 'c1',
  namespace_id: 'ns-1',
  name: 'CS 101',
  description: null,
  created_by: 'u1',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('useClasses integration (hook -> typed api -> api-client -> fetch)', () => {
  it('fetchClasses sends authenticated GET to /classes and populates state', async () => {
    // Backend returns plain array (not wrapped)
    mockFetchOk([fakeClass]);
    const { result } = renderHook(() => useClasses());

    await act(async () => {
      await result.current.fetchClasses();
    });

    // Verify the real api-client sent the correct request with auth header
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/classes'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer integration-token',
        }),
      })
    );
    // Verify hook state was updated from parsed JSON
    expect(result.current.classes).toEqual([fakeClass]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('createClass sends POST with JSON body, updates hook state, and returns the class', async () => {
    // Backend returns plain object (not wrapped)
    mockFetchOk(fakeClass);
    const { result } = renderHook(() => useClasses());

    let created: unknown;
    await act(async () => {
      created = await result.current.createClass('CS 101', 'Intro');
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/classes'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer integration-token',
        }),
        body: JSON.stringify({ name: 'CS 101', description: 'Intro' }),
      })
    );
    expect(created).toEqual(fakeClass);
    expect(result.current.classes).toEqual([fakeClass]);
  });

  it('deleteClass sends DELETE, removes from hook state', async () => {
    // First populate with fetchClasses (backend returns plain array)
    mockFetchOk([fakeClass]);
    const { result } = renderHook(() => useClasses());
    await act(async () => {
      await result.current.fetchClasses();
    });
    expect(result.current.classes).toHaveLength(1);

    // Now delete
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await act(async () => {
      await result.current.deleteClass('c1');
    });

    expect(global.fetch).toHaveBeenLastCalledWith(
      expect.stringContaining('/classes/c1'),
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(result.current.classes).toEqual([]);
  });

  it('fetchClasses sets error state when API returns 404 (non-retryable)', async () => {
    mockFetchError(404, 'Not found');
    const { result } = renderHook(() => useClasses());

    await act(async () => {
      await result.current.fetchClasses();
    });

    expect(result.current.error).toBe('Not found');
    expect(result.current.loading).toBe(false);
    expect(result.current.classes).toEqual([]);
  });

  it('updateClass sends PATCH and updates the correct item in state', async () => {
    // Backend returns plain array for GET
    mockFetchOk([fakeClass]);
    const { result } = renderHook(() => useClasses());
    await act(async () => {
      await result.current.fetchClasses();
    });

    const updated = { ...fakeClass, name: 'CS 102' };
    // Backend returns plain object for PATCH
    mockFetchOk(updated);

    let cls: unknown;
    await act(async () => {
      cls = await result.current.updateClass('c1', { name: 'CS 102' });
    });

    expect(global.fetch).toHaveBeenLastCalledWith(
      expect.stringContaining('/classes/c1'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ name: 'CS 102' }),
      })
    );
    expect(cls).toEqual(updated);
    expect(result.current.classes).toEqual([updated]);
  });

  it('createClass propagates error with status from real api-client error handling', async () => {
    mockFetchError(403, 'Forbidden');
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

  it('regenerateJoinCode sends POST to correct endpoint and returns Section', async () => {
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
    // Backend returns plain Section object (not wrapped)
    mockFetchOk(fakeSection);
    const { result } = renderHook(() => useClasses());

    let section: unknown;
    await act(async () => {
      section = await result.current.regenerateJoinCode('s1');
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/sections/s1/regenerate-code'),
      expect.objectContaining({ method: 'POST' })
    );
    expect(section).toEqual(fakeSection);
  });
});
