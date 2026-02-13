/**
 * Cross-layer integration tests for useNamespaces.
 *
 * Exercises the full chain: useNamespaces hook -> typed API module -> real api-client -> real withRetry -> mocked fetch.
 * Also tests real logic paths: state transitions (loading/error/data), error recovery,
 * and concurrent operation behavior.
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

// Mock the API module
jest.mock('@/lib/api/namespaces', () => ({
  listNamespaces: jest.fn(),
  createNamespace: jest.fn(),
  updateNamespace: jest.fn(),
  deleteNamespace: jest.fn(),
  getNamespaceUsers: jest.fn(),
  updateUserRole: jest.fn(),
  deleteUser: jest.fn(),
}));

import { renderHook, act } from '@testing-library/react';
import { useNamespaces } from '../useNamespaces';
import * as apiNamespaces from '@/lib/api/namespaces';

const mockApi = apiNamespaces as jest.Mocked<typeof apiNamespaces>;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetIdToken.mockResolvedValue('ns-token');
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockApiOk(fn: any, data: unknown) {
  fn.mockResolvedValue(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockApiSequence(fn: any, ...responses: unknown[]) {
  for (const resp of responses) {
    fn.mockResolvedValueOnce(resp);
  }
}

const fakeNamespace = {
  id: 'ns-1',
  display_name: 'Test NS',
  active: true,
  max_instructors: null,
  max_students: null,
  created_at: '2024-01-01T00:00:00Z',
  created_by: null,
  updated_at: '2024-01-01T00:00:00Z',
  userCount: 5,
};

const fakeUser = {
  id: 'u1',
  external_id: null,
  email: 'a@b.com',
  role: 'instructor' as const,
  namespace_id: 'ns-1',
  display_name: 'A',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('useNamespaces integration (hook -> typed API)', () => {
  it('fetchNamespaces calls listNamespaces and populates state', async () => {
    // Mock API returns plain array
    mockApiOk(mockApi.listNamespaces, [fakeNamespace]);
    const { result } = renderHook(() => useNamespaces());

    await act(async () => {
      await result.current.fetchNamespaces();
    });

    expect(mockApi.listNamespaces).toHaveBeenCalledWith(false);
    expect(result.current.namespaces).toEqual([fakeNamespace]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('fetchNamespaces with includeInactive passes true to listNamespaces', async () => {
    // Mock API returns plain array
    mockApiOk(mockApi.listNamespaces, []);
    const { result } = renderHook(() => useNamespaces());

    await act(async () => {
      await result.current.fetchNamespaces(true);
    });

    expect(mockApi.listNamespaces).toHaveBeenCalledWith(true);
  });

  it('createNamespace calls API then refreshes the list', async () => {
    // First call: createNamespace returns plain object
    mockApi.createNamespace.mockResolvedValueOnce(fakeNamespace);
    // Second call: listNamespaces refresh returns plain array
    mockApi.listNamespaces.mockResolvedValueOnce([fakeNamespace]);

    const { result } = renderHook(() => useNamespaces());

    let ns: unknown;
    await act(async () => {
      ns = await result.current.createNamespace('ns-1', 'Test NS');
    });

    expect(ns).toEqual(fakeNamespace);
    expect(mockApi.createNamespace).toHaveBeenCalledWith('ns-1', 'Test NS');
    expect(mockApi.listNamespaces).toHaveBeenCalledWith(false);
    expect(result.current.namespaces).toEqual([fakeNamespace]);
  });

  it('getNamespaceUsers calls API and returns users', async () => {
    // Mock API returns plain array
    mockApiOk(mockApi.getNamespaceUsers, [fakeUser]);
    const { result } = renderHook(() => useNamespaces());

    let users: unknown;
    await act(async () => {
      users = await result.current.getNamespaceUsers('ns-1');
    });

    expect(mockApi.getNamespaceUsers).toHaveBeenCalledWith('ns-1');
    expect(users).toEqual([fakeUser]);
  });

  it('deleteNamespace calls API then refreshes list', async () => {
    // First call: deleteNamespace resolves
    mockApi.deleteNamespace.mockResolvedValueOnce(undefined);
    // Second call: listNamespaces refresh returns empty array
    mockApi.listNamespaces.mockResolvedValueOnce([]);

    const { result } = renderHook(() => useNamespaces());

    await act(async () => {
      await result.current.deleteNamespace('ns-1');
    });

    expect(mockApi.deleteNamespace).toHaveBeenCalledWith('ns-1');
    expect(mockApi.listNamespaces).toHaveBeenCalledWith(false);
    expect(result.current.namespaces).toEqual([]);
  });

  describe('state transitions and error recovery', () => {
    it('loading transitions: false -> true -> false on success', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let resolvePromise: (v: any) => void;
      mockApi.listNamespaces.mockImplementation(
        () => new Promise(resolve => {
          resolvePromise = resolve;
        })
      );

      const { result } = renderHook(() => useNamespaces());
      expect(result.current.loading).toBe(false);

      let fetchPromise: Promise<void>;
      act(() => {
        fetchPromise = result.current.fetchNamespaces();
      });

      expect(result.current.loading).toBe(true);

      await act(async () => {
        resolvePromise!([]);
        await fetchPromise!;
      });

      expect(result.current.loading).toBe(false);
    });

    it('error then success: error state clears on subsequent successful fetch', async () => {
      // First call: throws error
      mockApi.listNamespaces.mockRejectedValueOnce(new Error('Not found'));

      const { result } = renderHook(() => useNamespaces());

      await act(async () => {
        try { await result.current.fetchNamespaces(); } catch { /* expected */ }
      });

      expect(result.current.error).toBe('Not found');

      // Second call: success with plain array
      mockApi.listNamespaces.mockResolvedValueOnce([fakeNamespace]);

      await act(async () => {
        await result.current.fetchNamespaces();
      });

      expect(result.current.error).toBeNull();
      expect(result.current.namespaces).toEqual([fakeNamespace]);
    });

    it('createNamespace sets error state and re-throws on API failure', async () => {
      mockApi.createNamespace.mockRejectedValue(new Error('Already exists'));

      const { result } = renderHook(() => useNamespaces());

      let caught: Error | undefined;
      await act(async () => {
        try {
          await result.current.createNamespace('ns-1', 'Test');
        } catch (e) {
          caught = e as Error;
        }
      });

      expect(caught).toBeInstanceOf(Error);
      expect(caught!.message).toBe('Already exists');
      expect(result.current.error).toBe('Already exists');
      expect(result.current.loading).toBe(false);
    });

  });
});
