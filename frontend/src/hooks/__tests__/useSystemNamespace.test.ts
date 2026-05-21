/**
 * Tests for useSystemNamespace hook
 * @jest-environment jsdom
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { useSystemNamespace } from '../useSystemNamespace';

// Mock useAuth
let mockUser: { role: string; namespace_id: string | null } | null = {
  role: 'system-admin',
  namespace_id: 'ns-1',
};
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
}));

// Mock system API
const mockGetSystemNamespace = jest.fn();
const mockListSystemNamespaces = jest.fn();
jest.mock('@/lib/api/system', () => ({
  getSystemNamespace: (...args: unknown[]) => mockGetSystemNamespace(...args),
  listSystemNamespaces: (...args: unknown[]) => mockListSystemNamespaces(...args),
}));

const NS_1 = { id: 'ns-1', displayName: 'Lincoln HS · CS', active: true };
const NS_2 = { id: 'ns-2', displayName: 'Jefferson MS', active: true };

describe('useSystemNamespace — system-admin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockUser = { role: 'system-admin', namespace_id: 'ns-1' };
    mockListSystemNamespaces.mockResolvedValue([NS_1, NS_2]);
  });

  /**
   * Happy path: localStorage has a saved id matching a list entry.
   * Contract: current=that entry, isAll=false, no error.
   */
  it('loads list and resolves current from localStorage savedId', async () => {
    localStorage.setItem('selectedNamespaceId', 'ns-2');

    const { result } = renderHook(() => useSystemNamespace());

    await waitFor(() => expect(result.current.list).toHaveLength(2));
    expect(result.current.current).toEqual(NS_2);
    expect(result.current.isAll).toBe(false);
    expect(result.current.error).toBeNull();
  });

  /**
   * 'all' sentinel branch: isAll=true and current=null.
   * Contract: regression-fix downstream — useSelectedNamespace will return null,
   * admin/page.tsx will send namespaceId: undefined (no filter).
   */
  it('flips isAll=true and current=null when savedId is the all sentinel', async () => {
    localStorage.setItem('selectedNamespaceId', 'all');

    const { result } = renderHook(() => useSystemNamespace());

    await waitFor(() => expect(result.current.list).toHaveLength(2));
    expect(result.current.isAll).toBe(true);
    expect(result.current.current).toBeNull();
  });

  /**
   * Fallback chain: savedId not present in the returned list — must pick nsList[0].
   * Contract: stale localStorage entries don't break the UI.
   */
  it('falls back to first namespace when savedId is not in the list', async () => {
    localStorage.setItem('selectedNamespaceId', 'ns-deleted');

    const { result } = renderHook(() => useSystemNamespace());

    await waitFor(() => expect(result.current.list).toHaveLength(2));
    expect(result.current.current).toEqual(NS_1);
    expect(result.current.isAll).toBe(false);
  });

  /**
   * Fallback chain: no savedId — falls back to user.namespace_id, then matched entry.
   */
  it('falls back to user namespace_id when localStorage is empty', async () => {
    const { result } = renderHook(() => useSystemNamespace());

    await waitFor(() => expect(result.current.list).toHaveLength(2));
    expect(result.current.current).toEqual(NS_1);
  });

  /**
   * Error path: listSystemNamespaces rejects — error state set, not console.error'd.
   */
  it('sets error state when listSystemNamespaces rejects', async () => {
    mockListSystemNamespaces.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useSystemNamespace());

    await waitFor(() => expect(result.current.error).toBe('boom'));
    expect(result.current.loading).toBe(false);
    expect(result.current.current).toBeNull();
  });

  /**
   * select('all') writes the sentinel.
   * (window.location.reload() is not mockable in jsdom — covered at E2E level.)
   */
  it('select(all) writes the all sentinel to localStorage', async () => {
    const { result } = renderHook(() => useSystemNamespace());

    await waitFor(() => expect(result.current.list).toHaveLength(2));

    act(() => {
      result.current.select('all');
    });

    expect(localStorage.getItem('selectedNamespaceId')).toBe('all');
  });

  /**
   * select(id) writes the id to localStorage.
   */
  it('select(id) writes the specific id to localStorage', async () => {
    const { result } = renderHook(() => useSystemNamespace());

    await waitFor(() => expect(result.current.list).toHaveLength(2));

    act(() => {
      result.current.select('ns-2');
    });

    expect(localStorage.getItem('selectedNamespaceId')).toBe('ns-2');
  });

  /**
   * select reference is stable across renders (useCallback).
   * Contract: prevents needless re-renders in downstream effects that depend on `select`.
   */
  it('select reference is stable across re-renders', async () => {
    const { result, rerender } = renderHook(() => useSystemNamespace());

    await waitFor(() => expect(result.current.list).toHaveLength(2));
    const firstSelect = result.current.select;

    rerender();
    expect(result.current.select).toBe(firstSelect);
  });
});

describe('useSystemNamespace — non-system-admin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockUser = { role: 'instructor', namespace_id: 'ns-1' };
    mockGetSystemNamespace.mockResolvedValue(NS_1);
  });

  /**
   * Non-admin gets current loaded via getSystemNamespace; list stays empty;
   * isAll stays false regardless of localStorage (sentinel is system-admin only).
   */
  it('loads single namespace via getSystemNamespace for non-admin', async () => {
    localStorage.setItem('selectedNamespaceId', 'all');

    const { result } = renderHook(() => useSystemNamespace());

    await waitFor(() => expect(result.current.current).toEqual(NS_1));
    expect(result.current.list).toEqual([]);
    expect(result.current.isAll).toBe(false);
    expect(mockListSystemNamespaces).not.toHaveBeenCalled();
  });

  /**
   * Error path: getSystemNamespace rejects — error state set, not console.error'd.
   */
  it('sets error state when getSystemNamespace rejects', async () => {
    mockGetSystemNamespace.mockRejectedValue(new Error('forbidden'));

    const { result } = renderHook(() => useSystemNamespace());

    await waitFor(() => expect(result.current.error).toBe('forbidden'));
    expect(result.current.current).toBeNull();
  });
});

describe('useSystemNamespace — no user', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockUser = null;
    mockListSystemNamespaces.mockResolvedValue([NS_1]);
    mockGetSystemNamespace.mockResolvedValue(NS_1);
  });

  /**
   * No user → no API calls fire; both effects bail on the guard.
   */
  it('skips API calls when user is null', () => {
    const { result } = renderHook(() => useSystemNamespace());
    expect(result.current.list).toEqual([]);
    expect(result.current.current).toBeNull();
    expect(mockListSystemNamespaces).not.toHaveBeenCalled();
    expect(mockGetSystemNamespace).not.toHaveBeenCalled();
  });
});
