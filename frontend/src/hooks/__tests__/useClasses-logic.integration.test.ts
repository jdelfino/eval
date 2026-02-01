/**
 * Logic-path tests for useClasses.
 *
 * Unlike the unit tests that mock api-client, these use the real api-client
 * and real withRetry to exercise actual code paths: state machine transitions,
 * optimistic updates, error propagation, and retry behavior.
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
  mockGetIdToken.mockResolvedValue('token');
});

const fakeClass1 = {
  id: 'c1', namespace_id: 'ns-1', name: 'CS 101',
  description: null, created_by: 'u1',
  created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
};

const fakeClass2 = {
  id: 'c2', namespace_id: 'ns-1', name: 'CS 201',
  description: 'Advanced', created_by: 'u1',
  created_at: '2024-01-02T00:00:00Z', updated_at: '2024-01-02T00:00:00Z',
};

function mockFetchOk(data: unknown) {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
  });
}

describe('useClasses logic paths', () => {
  describe('state transitions', () => {
    it('loading: false -> true -> false on fetchClasses', async () => {
      let resolve: (v: unknown) => void;
      (global.fetch as jest.Mock).mockReturnValue(
        new Promise(r => { resolve = r; })
      );

      const { result } = renderHook(() => useClasses());
      expect(result.current.loading).toBe(false);

      let promise: Promise<void>;
      act(() => {
        promise = result.current.fetchClasses();
      });
      expect(result.current.loading).toBe(true);

      await act(async () => {
        resolve!({ ok: true, json: () => Promise.resolve({ classes: [] }) });
        await promise!;
      });
      expect(result.current.loading).toBe(false);
    });

    it('error clears before each operation', async () => {
      // Cause a non-retryable error first (404)
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false, status: 404,
        json: () => Promise.resolve({ error: 'Not found' }),
      });
      const { result } = renderHook(() => useClasses());

      await act(async () => { await result.current.fetchClasses(); });
      expect(result.current.error).toBe('Not found');

      // Now do a successful fetch — error should clear
      mockFetchOk({ classes: [fakeClass1] });
      await act(async () => { await result.current.fetchClasses(); });
      expect(result.current.error).toBeNull();
      expect(result.current.classes).toEqual([fakeClass1]);
    });
  });

  describe('optimistic state updates', () => {
    it('createClass appends to existing classes without re-fetching', async () => {
      mockFetchOk({ classes: [fakeClass1] });
      const { result } = renderHook(() => useClasses());
      await act(async () => { await result.current.fetchClasses(); });
      expect(result.current.classes).toHaveLength(1);

      mockFetchOk({ class: fakeClass2 });
      await act(async () => { await result.current.createClass('CS 201', 'Advanced'); });

      expect(result.current.classes).toEqual([fakeClass1, fakeClass2]);
      // Only 2 fetch calls: initial GET + POST (no refresh GET)
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('updateClass replaces the correct item, leaves others intact', async () => {
      mockFetchOk({ classes: [fakeClass1, fakeClass2] });
      const { result } = renderHook(() => useClasses());
      await act(async () => { await result.current.fetchClasses(); });

      const updated = { ...fakeClass1, name: 'CS 102' };
      mockFetchOk({ class: updated });
      await act(async () => { await result.current.updateClass('c1', { name: 'CS 102' }); });

      expect(result.current.classes[0]).toEqual(updated);
      expect(result.current.classes[1]).toEqual(fakeClass2);
    });

    it('deleteClass removes only the targeted item', async () => {
      mockFetchOk({ classes: [fakeClass1, fakeClass2] });
      const { result } = renderHook(() => useClasses());
      await act(async () => { await result.current.fetchClasses(); });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true, json: () => Promise.resolve({}),
      });
      await act(async () => { await result.current.deleteClass('c1'); });

      expect(result.current.classes).toEqual([fakeClass2]);
    });
  });

  describe('error propagation from api-client', () => {
    it('createClass throws error with status from api-client (non-retryable 403)', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false, status: 403,
        json: () => Promise.resolve({ error: 'Permission denied' }),
      });
      const { result } = renderHook(() => useClasses());

      let caught: any;
      await act(async () => {
        try {
          await result.current.createClass('');
        } catch (e) {
          caught = e;
        }
      });

      expect(caught).toBeInstanceOf(Error);
      expect(caught.message).toBe('Permission denied');
      expect(caught.status).toBe(403);
    });

    it('fetchClasses catches non-retryable error and sets error state (does not throw)', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false, status: 401,
        json: () => Promise.resolve({ error: 'Unauthorized' }),
      });
      const { result } = renderHook(() => useClasses());

      // fetchClasses should NOT throw — it catches internally
      await act(async () => { await result.current.fetchClasses(); });

      expect(result.current.error).toBe('Unauthorized');
      expect(result.current.classes).toEqual([]);
    });

    it('fetch rejection with non-retryable error is caught and sets error state', async () => {
      // "Forbidden" matches permission category -> non-retryable, no retry delays
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Forbidden'));
      const { result } = renderHook(() => useClasses());

      await act(async () => { await result.current.fetchClasses(); });

      expect(result.current.error).toBeTruthy();
      expect(result.current.loading).toBe(false);
    });
  });

  describe('createSection and updateSection correctness', () => {
    it('createSection sends class_id in URL path', async () => {
      const fakeSection = {
        id: 's1', namespace_id: 'ns-1', class_id: 'c1',
        name: 'Section A', semester: 'Fall 2024', join_code: 'ABC',
        active: true, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
      };
      mockFetchOk({ section: fakeSection });
      const { result } = renderHook(() => useClasses());

      let sec: any;
      await act(async () => {
        sec = await result.current.createSection('c1', 'Section A', 'Fall 2024');
      });

      expect(sec).toEqual(fakeSection);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/classes/c1/sections'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'Section A', semester: 'Fall 2024' }),
        })
      );
    });

    it('updateSection sends section_id in URL path', async () => {
      const updatedSection = {
        id: 's1', namespace_id: 'ns-1', class_id: 'c1',
        name: 'Section B', semester: 'Fall 2024', join_code: 'ABC',
        active: true, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
      };
      mockFetchOk({ section: updatedSection });
      const { result } = renderHook(() => useClasses());

      let sec: any;
      await act(async () => {
        sec = await result.current.updateSection('s1', { name: 'Section B' });
      });

      expect(sec).toEqual(updatedSection);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/sections/s1'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ name: 'Section B' }),
        })
      );
    });
  });
});
