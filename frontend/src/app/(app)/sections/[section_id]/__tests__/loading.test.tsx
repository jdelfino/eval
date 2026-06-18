/**
 * Unit tests for the section-overview route-segment loading skeleton.
 *
 * Contract: the section overview's `loading.tsx` renders a multi-region
 * shimmer skeleton from the shared T5a Skeleton presets and is hidden from
 * assistive tech. Why it matters: it is the route-segment fallback during the
 * section overview's initial navigation; a missing/empty surface flashes blank.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render } from '@testing-library/react';
import SectionLoading from '../loading';

describe('section overview loading.tsx', () => {
  it('renders a non-empty skeleton tree', () => {
    const { container } = render(<SectionLoading />);

    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('is fully hidden from assistive technology', () => {
    const { container } = render(<SectionLoading />);

    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('[aria-hidden="false"]')).toBeNull();
  });

  it('composes the T5a Skeleton presets (rows + cards), not hand-rolled shimmer', () => {
    const { container } = render(<SectionLoading />);

    expect(container.querySelector('.rounded-full')).toBeInTheDocument();
    expect(container.querySelectorAll('.border').length).toBeGreaterThan(0);
  });
});
