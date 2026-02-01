/**
 * Tests for useSelectedNamespace and useNamespaceQueryParam hooks
 * @jest-environment jsdom
 */

import { renderHook } from '@testing-library/react';
import { useSelectedNamespace, useNamespaceQueryParam } from '../useSelectedNamespace';

// Mock useAuth
let mockUser: any = { role: 'system-admin', namespaceId: 'default' };
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
}));

describe('useSelectedNamespace', () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset mockUser to defaults
    mockUser.role = 'system-admin';
    mockUser.namespaceId = 'default';
  });

  it('returns localStorage value for system-admin', () => {
    localStorage.setItem('selectedNamespaceId', 'custom-ns');
    const { result } = renderHook(() => useSelectedNamespace());
    expect(result.current).toBe('custom-ns');
  });

  it('returns user namespaceId for system-admin when no localStorage', () => {
    const { result } = renderHook(() => useSelectedNamespace());
    expect(result.current).toBe('default');
  });

  it('returns user namespaceId for non-system-admin', () => {
    mockUser.role = 'instructor';
    mockUser.namespaceId = 'instructor-ns';
    const { result } = renderHook(() => useSelectedNamespace());
    expect(result.current).toBe('instructor-ns');
  });

  it('returns null when "all" is selected from localStorage', () => {
    localStorage.setItem('selectedNamespaceId', 'all');
    const { result } = renderHook(() => useSelectedNamespace());
    expect(result.current).toBeNull();
  });

  it('updates namespace when user loads asynchronously (null -> real user)', () => {
    // Simulate async auth: user starts as null
    mockUser = null;
    const { result, rerender } = renderHook(() => useSelectedNamespace());
    expect(result.current).toBeNull();

    // Auth finishes loading, user is now available
    mockUser = {
      role: 'instructor',
      namespaceId: 'ns-async',
    };
    rerender();
    expect(result.current).toBe('ns-async');
  });
});

describe('useNamespaceQueryParam', () => {
  beforeEach(() => {
    localStorage.clear();
    mockUser.role = 'system-admin';
    mockUser.namespaceId = 'default';
  });

  it('returns namespace query param for system-admin', () => {
    localStorage.setItem('selectedNamespaceId', 'my-ns');
    const { result } = renderHook(() => useNamespaceQueryParam());
    expect(result.current).toBe('?namespace=my-ns');
  });

  it('returns empty string for non-system-admin', () => {
    mockUser.role = 'instructor';
    mockUser.namespaceId = 'some-ns';
    const { result } = renderHook(() => useNamespaceQueryParam());
    expect(result.current).toBe('');
  });

  it('returns default namespace when no localStorage set for system-admin', () => {
    const { result } = renderHook(() => useNamespaceQueryParam());
    expect(result.current).toBe('?namespace=default');
  });

  it('returns empty string when "all" is selected for system-admin', () => {
    localStorage.setItem('selectedNamespaceId', 'all');
    const { result } = renderHook(() => useNamespaceQueryParam());
    expect(result.current).toBe('');
  });
});
