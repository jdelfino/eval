/**
 * Cross-layer integration tests for useNamespaces.
 *
 * Exercises the full chain: useNamespaces hook -> real api-client -> real withRetry -> mocked fetch.
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

import { renderHook, act } from '@testing-library/react';
import { useNamespaces } from '../useNamespaces';

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn();
  mockGetIdToken.mockResolvedValue('ns-token');
});

function mockFetchOk(data: unknown) {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
  });
}

function mockFetchSequence(...responses: Array<{ ok: boolean; status?: number; data: unknown }>) {
  const mock = global.fetch as jest.Mock;
  for (const resp of responses) {
    mock.mockResolvedValueOnce({
      ok: resp.ok,
      status: resp.status ?? 200,
      json: () => Promise.resolve(resp.data),
    });
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

describe('useNamespaces integration (hook -> api-client -> fetch)', () => {
  it('fetchNamespaces sends authenticated GET and populates state', async () => {
    mockFetchOk({ namespaces: [fakeNamespace] });
    const { result } = renderHook(() => useNamespaces());

    await act(async () => {
      await result.current.fetchNamespaces();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/namespaces?'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer ns-token',
        }),
      })
    );
    expect(result.current.namespaces).toEqual([fakeNamespace]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('fetchNamespaces with includeInactive appends query param', async () => {
    mockFetchOk({ namespaces: [] });
    const { result } = renderHook(() => useNamespaces());

    await act(async () => {
      await result.current.fetchNamespaces(true);
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('includeInactive=true'),
      expect.anything()
    );
  });

  it('createNamespace POSTs then refreshes the list', async () => {
    mockFetchSequence(
      { ok: true, data: { namespace: fakeNamespace } },
      { ok: true, data: { namespaces: [fakeNamespace] } },
    );

    const { result } = renderHook(() => useNamespaces());

    let ns: any;
    await act(async () => {
      ns = await result.current.createNamespace('ns-1', 'Test NS');
    });

    expect(ns).toEqual(fakeNamespace);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    // First call is POST
    expect((global.fetch as jest.Mock).mock.calls[0][1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ id: 'ns-1', display_name: 'Test NS' }),
      })
    );
    // Second call is GET (refresh)
    expect((global.fetch as jest.Mock).mock.calls[1][1]).toEqual(
      expect.objectContaining({ method: 'GET' })
    );
    expect(result.current.namespaces).toEqual([fakeNamespace]);
  });

  it('getNamespaceUsers sends GET and returns users', async () => {
    mockFetchOk({ users: [fakeUser] });
    const { result } = renderHook(() => useNamespaces());

    let users: any;
    await act(async () => {
      users = await result.current.getNamespaceUsers('ns-1');
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/namespaces/ns-1/users'),
      expect.objectContaining({ method: 'GET' })
    );
    expect(users).toEqual([fakeUser]);
  });

  it('deleteNamespace sends DELETE then refreshes list', async () => {
    mockFetchSequence(
      { ok: true, data: {} },
      { ok: true, data: { namespaces: [] } },
    );

    const { result } = renderHook(() => useNamespaces());

    await act(async () => {
      await result.current.deleteNamespace('ns-1');
    });

    expect((global.fetch as jest.Mock).mock.calls[0][1]).toEqual(
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(result.current.namespaces).toEqual([]);
  });

  describe('state transitions and error recovery', () => {
    it('loading transitions: false -> true -> false on success', async () => {
      let resolvePromise: (v: unknown) => void;
      (global.fetch as jest.Mock).mockReturnValue(
        new Promise(resolve => {
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
        resolvePromise!({
          ok: true,
          json: () => Promise.resolve({ namespaces: [] }),
        });
        await fetchPromise!;
      });

      expect(result.current.loading).toBe(false);
    });

    it('error then success: error state clears on subsequent successful fetch', async () => {
      // First call: 404 error (non-retryable)
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Not found' }),
      });

      const { result } = renderHook(() => useNamespaces());

      await act(async () => {
        try { await result.current.fetchNamespaces(); } catch { /* expected */ }
      });

      expect(result.current.error).toBe('Not found');

      // Second call: success
      mockFetchOk({ namespaces: [fakeNamespace] });

      await act(async () => {
        await result.current.fetchNamespaces();
      });

      expect(result.current.error).toBeNull();
      expect(result.current.namespaces).toEqual([fakeNamespace]);
    });

    it('createNamespace sets error state and re-throws on API failure', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ error: 'Already exists' }),
      });

      const { result } = renderHook(() => useNamespaces());

      let caught: any;
      await act(async () => {
        try {
          await result.current.createNamespace('ns-1', 'Test');
        } catch (e) {
          caught = e;
        }
      });

      expect(caught).toBeInstanceOf(Error);
      expect(caught.message).toBe('Already exists');
      expect(result.current.error).toBe('Already exists');
      expect(result.current.loading).toBe(false);
    });

    it('createUser sends correct payload through the full chain', async () => {
      mockFetchOk({ user: fakeUser });
      const { result } = renderHook(() => useNamespaces());

      let user: any;
      await act(async () => {
        user = await result.current.createUser('ns-1', 'a@b.com', 'auser', 'pass', 'instructor');
      });

      expect(user).toEqual(fakeUser);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/namespaces/ns-1/users'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            email: 'a@b.com',
            username: 'auser',
            password: 'pass',
            role: 'instructor',
          }),
        })
      );
    });
  });
});
