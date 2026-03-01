/**
 * @jest-environment jsdom
 */

import { renderHook } from '@testing-library/react';
import { usePermission, useAnyPermission, useAllPermissions, hasPermission } from '../usePermissions';

// New API: user has a permissions array (from server), not a role-based mapping
const makeUser = (permissions: string[]) => ({ permissions });

describe('usePermission', () => {
  it('returns true when user has the permission in their permissions array', () => {
    const { result } = renderHook(() =>
      usePermission(makeUser(['session.manage', 'content.manage']), 'session.manage')
    );
    expect(result.current).toBe(true);
  });

  it('returns false when user does not have the permission in their permissions array', () => {
    const { result } = renderHook(() =>
      usePermission(makeUser(['session.join']), 'session.manage')
    );
    expect(result.current).toBe(false);
  });

  it('returns false when user is null', () => {
    const { result } = renderHook(() => usePermission(null, 'session.manage'));
    expect(result.current).toBe(false);
  });

  it('returns false when user has no permissions array', () => {
    const { result } = renderHook(() =>
      usePermission({}, 'session.manage')
    );
    expect(result.current).toBe(false);
  });

  it('returns false when user has an empty permissions array', () => {
    const { result } = renderHook(() =>
      usePermission(makeUser([]), 'session.manage')
    );
    expect(result.current).toBe(false);
  });
});

describe('useAnyPermission', () => {
  it('returns true when user has at least one of the given permissions', () => {
    const { result } = renderHook(() =>
      useAnyPermission(makeUser(['session.join']), ['session.manage', 'session.join'])
    );
    expect(result.current).toBe(true);
  });

  it('returns false when user has none of the given permissions', () => {
    const { result } = renderHook(() =>
      useAnyPermission(makeUser(['session.join']), ['session.manage', 'system.admin'])
    );
    expect(result.current).toBe(false);
  });

  it('returns false when user is null', () => {
    const { result } = renderHook(() => useAnyPermission(null, ['session.join']));
    expect(result.current).toBe(false);
  });
});

describe('useAllPermissions', () => {
  it('returns true when user has all of the given permissions', () => {
    const { result } = renderHook(() =>
      useAllPermissions(makeUser(['session.manage', 'content.manage']), ['session.manage', 'content.manage'])
    );
    expect(result.current).toBe(true);
  });

  it('returns false when user is missing one permission', () => {
    const { result } = renderHook(() =>
      useAllPermissions(makeUser(['session.join']), ['session.join', 'session.manage'])
    );
    expect(result.current).toBe(false);
  });

  it('returns false when user is null', () => {
    const { result } = renderHook(() => useAllPermissions(null, ['session.join']));
    expect(result.current).toBe(false);
  });
});

describe('hasPermission (non-hook)', () => {
  it('returns true when user has permission in their permissions array', () => {
    expect(hasPermission(makeUser(['system.admin']), 'system.admin')).toBe(true);
  });

  it('returns false when user lacks permission', () => {
    expect(hasPermission(makeUser(['session.join']), 'system.admin')).toBe(false);
  });

  it('returns false when user is null', () => {
    expect(hasPermission(null, 'session.join')).toBe(false);
  });

  it('returns false when user has no permissions field', () => {
    expect(hasPermission({}, 'session.join')).toBe(false);
  });
});
