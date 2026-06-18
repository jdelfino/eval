/**
 * Unit tests for the instructor dashboard route-segment loading skeleton.
 *
 * Contract: the dashboard's `loading.tsx` renders a multi-region shimmer
 * skeleton (header + accent banner + 2fr/1fr grid of rows/key-values) built
 * from the shared T5a Skeleton presets, fully hidden from assistive tech.
 * Why it matters: this is the route-segment fallback Next.js shows during the
 * dashboard's initial navigation; an empty or non-aria-hidden surface would
 * flash blank content or leak placeholder noise to screen readers.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render } from '@testing-library/react';
import DashboardLoading from '../loading';

describe('instructor dashboard loading.tsx', () => {
  it('renders a non-empty skeleton tree', () => {
    const { container } = render(<DashboardLoading />);

    // pulse blocks come from the shared Skeleton primitive
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('is fully hidden from assistive technology', () => {
    const { container } = render(<DashboardLoading />);

    // Every rendered element under the root must be aria-hidden (root included),
    // so the skeleton never exposes content to screen readers.
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('[aria-hidden="false"]')).toBeNull();
  });

  it('composes the T5a Skeleton presets (rows + cards), not hand-rolled shimmer', () => {
    const { container } = render(<DashboardLoading />);

    // SkeletonRow renders a rounded-full pill chip; SkeletonCard renders a
    // bordered/raised box. Asserting both proves the route reuses the presets.
    expect(container.querySelector('.rounded-full')).toBeInTheDocument();
    expect(container.querySelectorAll('.border').length).toBeGreaterThan(0);
  });
});
