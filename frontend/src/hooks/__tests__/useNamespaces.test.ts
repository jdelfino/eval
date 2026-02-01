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
  ID: 'u1',
  ExternalID: null,
  Email: 'a@b.com',
  Role: 'instructor' as const,
  NamespaceID: 'ns-1',
  DisplayName: 'A',
  CreatedAt: '2024-01-01T00:00:00Z',
  UpdatedAt: '2024-01-01T00:00:00Z',
};

describe('useNamespaces', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetchNamespaces sets namespaces on success', async () => {
    mockApiGet.mockResolvedValue({ namespaces: [fakeNamespace] });
    const { result } = renderHook(() => useNamespaces());

    await act(async () => { await result.current.fetchNamespaces(); });

    expect(result.current.namespaces).toEqual([fakeNamespace]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(mockApiGet).toHaveBeenCalledWith('/namespaces?');
  });

  it('fetchNamespaces passes includeInactive param', async () => {
    mockApiGet.mockResolvedValue({ namespaces: [] });
    const { result } = renderHook(() => useNamespaces());

    await act(async () => { await result.current.fetchNamespaces(true); });

    expect(mockApiGet).toHaveBeenCalledWith('/namespaces?includeInactive=true');
  });

  it('fetchNamespaces sets error on failure', async () => {
    mockApiGet.mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useNamespaces());

    await act(async () => {
      try { await result.current.fetchNamespaces(); } catch (_) { /* expected */ }
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.loading).toBe(false);
  });

  it('createNamespace posts and refreshes list', async () => {
    mockApiPost.mockResolvedValue({ namespace: fakeNamespace });
    mockApiGet.mockResolvedValue({ namespaces: [fakeNamespace] });
    const { result } = renderHook(() => useNamespaces());

    let ns: any;
    await act(async () => { ns = await result.current.createNamespace('ns-1', 'Test NS'); });

    expect(ns).toEqual(fakeNamespace);
    expect(mockApiPost).toHaveBeenCalledWith('/namespaces', { id: 'ns-1', display_name: 'Test NS' });
    expect(mockApiGet).toHaveBeenCalled();
  });

  it('updateNamespace patches and refreshes list', async () => {
    const updated = { ...fakeNamespace, display_name: 'New Name' };
    mockApiPatch.mockResolvedValue({ namespace: updated });
    mockApiGet.mockResolvedValue({ namespaces: [updated] });
    const { result } = renderHook(() => useNamespaces());

    let ns: any;
    await act(async () => { ns = await result.current.updateNamespace('ns-1', { display_name: 'New Name' }); });

    expect(ns).toEqual(updated);
    expect(mockApiPatch).toHaveBeenCalledWith('/namespaces/ns-1', { display_name: 'New Name' });
  });

  it('deleteNamespace deletes and refreshes list', async () => {
    mockApiDelete.mockResolvedValue(undefined);
    mockApiGet.mockResolvedValue({ namespaces: [] });
    const { result } = renderHook(() => useNamespaces());

    await act(async () => { await result.current.deleteNamespace('ns-1'); });

    expect(mockApiDelete).toHaveBeenCalledWith('/namespaces/ns-1');
    expect(result.current.namespaces).toEqual([]);
  });

  it('getNamespaceUsers fetches users', async () => {
    mockApiGet.mockResolvedValue({ users: [fakeUser] });
    const { result } = renderHook(() => useNamespaces());

    let users: any;
    await act(async () => { users = await result.current.getNamespaceUsers('ns-1'); });

    expect(users).toEqual([fakeUser]);
    expect(mockApiGet).toHaveBeenCalledWith('/namespaces/ns-1/users');
  });

  it('createUser posts to namespace users endpoint', async () => {
    mockApiPost.mockResolvedValue({ user: fakeUser });
    const { result } = renderHook(() => useNamespaces());

    let user: any;
    await act(async () => {
      user = await result.current.createUser('ns-1', 'a@b.com', 'auser', 'pass', 'instructor');
    });

    expect(user).toEqual(fakeUser);
    expect(mockApiPost).toHaveBeenCalledWith('/namespaces/ns-1/users', {
      email: 'a@b.com', username: 'auser', password: 'pass', role: 'instructor',
    });
  });

  it('updateUserRole patches user role', async () => {
    mockApiPatch.mockResolvedValue({ user: { ...fakeUser, Role: 'student' } });
    const { result } = renderHook(() => useNamespaces());

    await act(async () => { await result.current.updateUserRole('u1', 'student'); });

    expect(mockApiPatch).toHaveBeenCalledWith('/users/u1', { role: 'student' });
  });

  it('deleteUser deletes user', async () => {
    mockApiDelete.mockResolvedValue(undefined);
    const { result } = renderHook(() => useNamespaces());

    await act(async () => { await result.current.deleteUser('u1'); });

    expect(mockApiDelete).toHaveBeenCalledWith('/users/u1');
  });
});
