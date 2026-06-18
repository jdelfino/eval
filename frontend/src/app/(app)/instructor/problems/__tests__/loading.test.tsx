/**
 * Unit tests for the problem-library route-segment loading skeleton.
 *
 * Contract: the library's `loading.tsx` renders a multi-region shimmer
 * skeleton from the shared T5a Skeleton presets and is hidden from assistive
 * tech. Why it matters: it is the route-segment fallback during the library's
 * initial navigation; a missing/empty surface flashes blank.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render } from '@testing-library/react';
import LibraryLoading from '../loading';

describe('problem library loading.tsx', () => {
  it('renders a non-empty skeleton tree', () => {
    const { container } = render(<LibraryLoading />);

    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('is fully hidden from assistive technology', () => {
    const { container } = render(<LibraryLoading />);

    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('[aria-hidden="false"]')).toBeNull();
  });

  it('composes the T5a Skeleton presets (cards), not hand-rolled shimmer', () => {
    const { container } = render(<LibraryLoading />);

    // Library is a grid of problem cards -> multiple SkeletonCard bordered boxes.
    expect(container.querySelectorAll('.border').length).toBeGreaterThan(1);
  });
});
