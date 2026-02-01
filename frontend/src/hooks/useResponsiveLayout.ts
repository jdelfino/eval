'use client';

import { useState, useEffect } from 'react';

/**
 * Custom hook to detect responsive layout breakpoint
 * Returns true for desktop layout (>= 1024px), false for mobile
 */
export function useResponsiveLayout(breakpoint: number = 1024): boolean {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    // Check if we're in the browser
    if (typeof window === 'undefined') {
      return;
    }

    // Initial check
    const checkLayout = () => {
      setIsDesktop(window.innerWidth >= breakpoint);
    };

    checkLayout();

    // Add resize listener
    window.addEventListener('resize', checkLayout);

    return () => {
      window.removeEventListener('resize', checkLayout);
    };
  }, [breakpoint]);

  return isDesktop;
}

/**
 * Mobile viewport info for responsive design
 */
export interface MobileViewportInfo {
  /** True if viewport is mobile (< 768px) */
  isMobile: boolean;
  /** True if viewport is tablet (768px - 1023px) */
  isTablet: boolean;
  /** True if viewport is very small (< 480px, typically phones in portrait) */
  isVerySmall: boolean;
  /** True if viewport width >= 1024px */
  isDesktop: boolean;
  /** Current viewport width in pixels */
  width: number;
}

/**
 * Custom hook to detect mobile viewport with more granular breakpoints
 * Useful for adapting UI components to different mobile device sizes
 *
 * Breakpoints:
 * - Very small: < 480px (portrait phones)
 * - Mobile: < 768px (phones)
 * - Tablet: 768px - 1023px
 * - Desktop: >= 1024px
 */
export function useMobileViewport(): MobileViewportInfo {
  const [viewport, setViewport] = useState<MobileViewportInfo>({
    isMobile: false,
    isTablet: false,
    isVerySmall: false,
    isDesktop: false,
    width: 0,
  });

  useEffect(() => {
    // Check if we're in the browser
    if (typeof window === 'undefined') {
      return;
    }

    const checkViewport = () => {
      const width = window.innerWidth;
      setViewport({
        isMobile: width < 768,
        isTablet: width >= 768 && width < 1024,
        isVerySmall: width < 480,
        isDesktop: width >= 1024,
        width,
      });
    };

    checkViewport();

    // Add resize listener
    window.addEventListener('resize', checkViewport);

    return () => {
      window.removeEventListener('resize', checkViewport);
    };
  }, []);

  return viewport;
}

/**
 * Custom hook to manage collapsible sidebar sections with localStorage persistence
 */
export function useSidebarSection(sectionId: string, defaultCollapsed: boolean = false) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  useEffect(() => {
    // Load collapsed state from localStorage
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(`sidebar-${sectionId}-collapsed`);
      if (saved !== null) {
        setIsCollapsed(saved === 'true');
      }
    }
  }, [sectionId]);

  const toggle = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    if (typeof window !== 'undefined') {
      localStorage.setItem(`sidebar-${sectionId}-collapsed`, String(newState));
    }
  };

  const setCollapsed = (collapsed: boolean) => {
    setIsCollapsed(collapsed);
    if (typeof window !== 'undefined') {
      localStorage.setItem(`sidebar-${sectionId}-collapsed`, String(collapsed));
    }
  };

  return { isCollapsed, toggle, setCollapsed };
}
