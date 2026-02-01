/**
 * @jest-environment jsdom
 */

import { renderHook } from '@testing-library/react';
import { usePermission, useAnyPermission, useAllPermissions, hasPermission } from '../usePermissions';

const makeUser = (Role: 'system-admin' | 'namespace-admin' | 'instructor' | 'student') => ({ Role });

describe('usePermission', () => {
  it('returns true when user has permission', () => {
    const { result } = renderHook(() => usePermission(makeUser('instructor'), 'session.create'));
    expect(result.current).toBe(true);
  });

  it('returns false when user lacks permission', () => {
    const { result } = renderHook(() => usePermission(makeUser('student'), 'session.create'));
    expect(result.current).toBe(false);
  });

  it('returns false when user is null', () => {
    const { result } = renderHook(() => usePermission(null, 'session.create'));
    expect(result.current).toBe(false);
  });
});

describe('useAnyPermission', () => {
  it('returns true when user has at least one permission', () => {
    const { result } = renderHook(() =>
      useAnyPermission(makeUser('student'), ['session.create', 'session.join'])
    );
    expect(result.current).toBe(true);
  });

  it('returns false when user has none of the permissions', () => {
    const { result } = renderHook(() =>
      useAnyPermission(makeUser('student'), ['session.create', 'system.admin'])
    );
    expect(result.current).toBe(false);
  });

  it('returns false when user is null', () => {
    const { result } = renderHook(() => useAnyPermission(null, ['session.join']));
    expect(result.current).toBe(false);
  });
});

describe('useAllPermissions', () => {
  it('returns true when user has all permissions', () => {
    const { result } = renderHook(() =>
      useAllPermissions(makeUser('instructor'), ['session.create', 'class.read'])
    );
    expect(result.current).toBe(true);
  });

  it('returns false when user is missing one permission', () => {
    const { result } = renderHook(() =>
      useAllPermissions(makeUser('student'), ['session.join', 'session.create'])
    );
    expect(result.current).toBe(false);
  });

  it('returns false when user is null', () => {
    const { result } = renderHook(() => useAllPermissions(null, ['session.join']));
    expect(result.current).toBe(false);
  });
});

describe('hasPermission (non-hook)', () => {
  it('returns true when user has permission', () => {
    expect(hasPermission(makeUser('system-admin'), 'system.admin')).toBe(true);
  });

  it('returns false when user lacks permission', () => {
    expect(hasPermission(makeUser('student'), 'system.admin')).toBe(false);
  });

  it('returns false when user is null', () => {
    expect(hasPermission(null, 'session.join')).toBe(false);
  });
});
