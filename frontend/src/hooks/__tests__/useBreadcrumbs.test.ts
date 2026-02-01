/**
 * Tests for useBreadcrumbs hook
 * @jest-environment jsdom
 */

import { renderHook } from '@testing-library/react';
import { useBreadcrumbs } from '../useBreadcrumbs';

// Mock next/navigation
const mockPathname = jest.fn();
jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
}));

describe('useBreadcrumbs', () => {
  beforeEach(() => {
    mockPathname.mockReset();
  });

  describe('top-level routes', () => {
    it('returns single breadcrumb for /classes', () => {
      mockPathname.mockReturnValue('/classes');

      const { result } = renderHook(() => useBreadcrumbs());

      expect(result.current).toEqual([
        { label: 'Classes', href: undefined },
      ]);
    });

    it('returns single breadcrumb for /sections', () => {
      mockPathname.mockReturnValue('/sections');

      const { result } = renderHook(() => useBreadcrumbs());

      expect(result.current).toEqual([
        { label: 'My Sections', href: undefined },
      ]);
    });

    it('returns single breadcrumb for /instructor', () => {
      mockPathname.mockReturnValue('/instructor');

      const { result } = renderHook(() => useBreadcrumbs());

      expect(result.current).toEqual([
        { label: 'Dashboard', href: undefined },
      ]);
    });

    it('returns single breadcrumb for /admin', () => {
      mockPathname.mockReturnValue('/admin');

      const { result } = renderHook(() => useBreadcrumbs());

      // /admin maps to User Management nav item
      expect(result.current).toEqual([
        { label: 'User Management', href: undefined },
      ]);
    });

    it('returns single breadcrumb for /system', () => {
      mockPathname.mockReturnValue('/system');

      const { result } = renderHook(() => useBreadcrumbs());

      expect(result.current).toEqual([
        { label: 'Namespaces', href: undefined },
      ]);
    });
  });

  describe('nested routes', () => {
    it('returns breadcrumb chain for /classes/123', () => {
      mockPathname.mockReturnValue('/classes/123');

      const { result } = renderHook(() => useBreadcrumbs());

      expect(result.current).toEqual([
        { label: 'Classes', href: '/classes' },
        { label: '123', href: undefined },
      ]);
    });

    it('returns breadcrumb chain for /sections/abc', () => {
      mockPathname.mockReturnValue('/sections/abc');

      const { result } = renderHook(() => useBreadcrumbs());

      expect(result.current).toEqual([
        { label: 'My Sections', href: '/sections' },
        { label: 'abc', href: undefined },
      ]);
    });

    it('returns breadcrumb chain for /instructor/session/xyz', () => {
      mockPathname.mockReturnValue('/instructor/session/xyz');

      const { result } = renderHook(() => useBreadcrumbs());

      expect(result.current).toEqual([
        { label: 'Dashboard', href: '/instructor' },
        { label: 'xyz', href: undefined },
      ]);
    });

    it('returns breadcrumb chain for /system/namespaces/ns1', () => {
      mockPathname.mockReturnValue('/system/namespaces/ns1');

      const { result } = renderHook(() => useBreadcrumbs());

      expect(result.current).toEqual([
        { label: 'Namespaces', href: '/system' },
        { label: 'ns1', href: undefined },
      ]);
    });
  });

  describe('deeply nested routes', () => {
    it('returns full chain for /sections/sec1/session/sess1', () => {
      mockPathname.mockReturnValue('/sections/sec1/session/sess1');

      const { result } = renderHook(() => useBreadcrumbs());

      expect(result.current).toEqual([
        { label: 'My Sections', href: '/sections' },
        { label: 'sec1', href: '/sections/sec1' },
        { label: 'sess1', href: undefined },
      ]);
    });
  });

  describe('unknown routes', () => {
    it('returns empty array for unregistered route', () => {
      mockPathname.mockReturnValue('/unknown/page');

      const { result } = renderHook(() => useBreadcrumbs());

      expect(result.current).toEqual([]);
    });

    it('returns empty array for root path', () => {
      mockPathname.mockReturnValue('/');

      const { result } = renderHook(() => useBreadcrumbs());

      expect(result.current).toEqual([]);
    });
  });

  describe('reactivity', () => {
    it('updates when pathname changes', () => {
      mockPathname.mockReturnValue('/classes');

      const { result, rerender } = renderHook(() => useBreadcrumbs());

      expect(result.current).toEqual([
        { label: 'Classes', href: undefined },
      ]);

      mockPathname.mockReturnValue('/classes/456');
      rerender();

      expect(result.current).toEqual([
        { label: 'Classes', href: '/classes' },
        { label: '456', href: undefined },
      ]);
    });
  });
});
