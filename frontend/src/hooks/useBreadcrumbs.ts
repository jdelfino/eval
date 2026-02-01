'use client';

/**
 * Hook for generating breadcrumb items from the current path.
 * Uses BREADCRUMB_HIERARCHY from navigation config.
 */

import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { BREADCRUMB_HIERARCHY, NAV_ITEMS } from '@/config/navigation';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

/**
 * Convert a route pattern like '/classes/[id]' and actual path '/classes/123'
 * to extract dynamic segments for display.
 */
function matchRouteToPath(pattern: string, path: string): { matches: boolean; segments: Record<string, string> } {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = path.split('/').filter(Boolean);

  if (patternParts.length !== pathParts.length) {
    return { matches: false, segments: {} };
  }

  const segments: Record<string, string> = {};

  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i];
    const pathPart = pathParts[i];

    if (patternPart.startsWith('[') && patternPart.endsWith(']')) {
      // Dynamic segment
      const key = patternPart.slice(1, -1);
      segments[key] = pathPart;
    } else if (patternPart !== pathPart) {
      return { matches: false, segments: {} };
    }
  }

  return { matches: true, segments };
}

/**
 * Find the matching route pattern for a given path.
 */
function findMatchingPattern(path: string): string | null {
  const patterns = Object.keys(BREADCRUMB_HIERARCHY);

  for (const pattern of patterns) {
    const { matches } = matchRouteToPath(pattern, path);
    if (matches) {
      return pattern;
    }
  }

  return null;
}

/**
 * Get a human-readable label for a route pattern.
 */
function getLabelForPattern(pattern: string, segments: Record<string, string>): string {
  // Check if this pattern matches a nav item
  const navItem = NAV_ITEMS.find(item => item.href === pattern);
  if (navItem) {
    return navItem.label;
  }

  // Generate a label based on the pattern
  const parts = pattern.split('/').filter(Boolean);
  const lastPart = parts[parts.length - 1];

  // If it's a dynamic segment, return its value
  if (lastPart.startsWith('[') && lastPart.endsWith(']')) {
    const key = lastPart.slice(1, -1);
    return segments[key] || lastPart;
  }

  // Capitalize and format the last part
  return lastPart.charAt(0).toUpperCase() + lastPart.slice(1).replace(/-/g, ' ');
}

/**
 * Reconstruct an actual path from a pattern and segments.
 */
function reconstructPath(pattern: string, segments: Record<string, string>): string {
  return pattern.replace(/\[([^\]]+)\]/g, (_, key) => segments[key] || key);
}

/**
 * Hook to generate breadcrumb items from the current path.
 * @returns Array of breadcrumb items with label and optional href
 */
export function useBreadcrumbs(): BreadcrumbItem[] {
  const pathname = usePathname();

  return useMemo(() => {
    const breadcrumbs: BreadcrumbItem[] = [];
    const matchedPattern = findMatchingPattern(pathname);

    if (!matchedPattern) {
      return breadcrumbs;
    }

    // Collect segments from the full path
    const { segments } = matchRouteToPath(matchedPattern, pathname);

    // Build breadcrumb chain by walking up the hierarchy
    const chain: string[] = [];
    let current: string | null = matchedPattern;

    while (current) {
      chain.unshift(current);
      current = BREADCRUMB_HIERARCHY[current];
    }

    // Convert chain to breadcrumb items
    for (let i = 0; i < chain.length; i++) {
      const pattern = chain[i];
      const isLast = i === chain.length - 1;
      const label = getLabelForPattern(pattern, segments);
      const href = isLast ? undefined : reconstructPath(pattern, segments);

      breadcrumbs.push({ label, href });
    }

    return breadcrumbs;
  }, [pathname]);
}
