/**
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';

// Mock the typed namespaces API module
const mockListNamespaces = jest.fn();
const mockCreateNamespace = jest.fn();
const mockUpdateNamespace = jest.fn();
const mockDeleteNamespace = jest.fn();
const mockGetNamespaceUsers = jest.fn();
const mockUpdateUserRole = jest.fn();
const mockDeleteUser = jest.fn();

jest.mock('@/lib/api/namespaces', () => ({
  listNamespaces: (...args: unknown[]) => mockListNamespaces(...args),
  createNamespace: (...args: unknown[]) => mockCreateNamespace(...args),
  updateNamespace: (...args: unknown[]) => mockUpdateNamespace(...args),
  deleteNamespace: (...args: unknown[]) => mockDeleteNamespace(...args),
  getNamespaceUsers: (...args: unknown[]) => mockGetNamespaceUsers(...args),
  updateUserRole: (...args: unknown[]) => mockUpdateUserRole(...args),
  deleteUser: (...args: unknown[]) => mockDeleteUser(...args),
}));

import { useNamespaces } from '../useNamespaces';

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

describe('useNamespaces', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetchNamespaces sets namespaces on success', async () => {
    // Typed API returns plain array (not wrapped)
    mockListNamespaces.mockResolvedValue([fakeNamespace]);
    const { result } = renderHook(() => useNamespaces());

    await act(async () => { await result.current.fetchNamespaces(); });

    expect(result.current.namespaces).toEqual([fakeNamespace]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(mockListNamespaces).toHaveBeenCalledWith(false);
  });

  it('fetchNamespaces passes includeInactive param', async () => {
    mockListNamespaces.mockResolvedValue([]);
    const { result } = renderHook(() => useNamespaces());

    await act(async () => { await result.current.fetchNamespaces(true); });

    expect(mockListNamespaces).toHaveBeenCalledWith(true);
  });

  it('fetchNamespaces sets error on failure', async () => {
    mockListNamespaces.mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useNamespaces());

    let thrownError: Error | undefined;
    await act(async () => {
      try {
        await result.current.fetchNamespaces();
      } catch (e) {
        thrownError = e as Error;
      }
    });

    // Verify the error was re-thrown with correct message
    expect(thrownError).toBeInstanceOf(Error);
    expect(thrownError!.message).toBe('Network error');
    // Verify internal hook state reflects the error
    expect(result.current.error).toBe('Network error');
    expect(result.current.loading).toBe(false);
    expect(result.current.namespaces).toEqual([]);
  });

  it('createNamespace posts and refreshes list', async () => {
    // Typed API returns plain object (not wrapped)
    mockCreateNamespace.mockResolvedValue(fakeNamespace);
    mockListNamespaces.mockResolvedValue([fakeNamespace]);
    const { result } = renderHook(() => useNamespaces());

    let ns: unknown;
    await act(async () => { ns = await result.current.createNamespace('ns-1', 'Test NS'); });

    expect(ns).toEqual(fakeNamespace);
    expect(mockCreateNamespace).toHaveBeenCalledWith('ns-1', 'Test NS');
    expect(mockListNamespaces).toHaveBeenCalled();
  });

  it('updateNamespace patches and refreshes list', async () => {
    const updated = { ...fakeNamespace, display_name: 'New Name' };
    // Typed API returns plain object (not wrapped)
    mockUpdateNamespace.mockResolvedValue(updated);
    mockListNamespaces.mockResolvedValue([updated]);
    const { result } = renderHook(() => useNamespaces());

    let ns: unknown;
    await act(async () => { ns = await result.current.updateNamespace('ns-1', { display_name: 'New Name' }); });

    expect(ns).toEqual(updated);
    expect(mockUpdateNamespace).toHaveBeenCalledWith('ns-1', { display_name: 'New Name' });
  });

  it('deleteNamespace deletes and refreshes list', async () => {
    mockDeleteNamespace.mockResolvedValue(undefined);
    mockListNamespaces.mockResolvedValue([]);
    const { result } = renderHook(() => useNamespaces());

    await act(async () => { await result.current.deleteNamespace('ns-1'); });

    expect(mockDeleteNamespace).toHaveBeenCalledWith('ns-1');
    expect(result.current.namespaces).toEqual([]);
  });

  it('getNamespaceUsers fetches users', async () => {
    // Typed API returns plain array (not wrapped)
    mockGetNamespaceUsers.mockResolvedValue([fakeUser]);
    const { result } = renderHook(() => useNamespaces());

    let users: unknown;
    await act(async () => { users = await result.current.getNamespaceUsers('ns-1'); });

    expect(users).toEqual([fakeUser]);
    expect(mockGetNamespaceUsers).toHaveBeenCalledWith('ns-1');
  });

  it('updateUserRole patches user role', async () => {
    const updated = { ...fakeUser, role: 'student' as const };
    // Typed API returns plain object (not wrapped)
    mockUpdateUserRole.mockResolvedValue(updated);
    const { result } = renderHook(() => useNamespaces());

    const user = await act(async () => { return await result.current.updateUserRole('u1', 'student'); });

    expect(mockUpdateUserRole).toHaveBeenCalledWith('u1', 'student');
    expect(user).toEqual(updated);
  });

  it('deleteUser deletes user', async () => {
    mockDeleteUser.mockResolvedValue(undefined);
    const { result } = renderHook(() => useNamespaces());

    await act(async () => { await result.current.deleteUser('u1'); });

    expect(mockDeleteUser).toHaveBeenCalledWith('u1');
  });
});
