/**
 * Unit tests for StateDot component
 * @jest-environment jsdom
 *
 * Verifies that StateDot renders with the correct background color token
 * for each state (pass/fail/running/idle).
 * Regressions here mean state→color drift — a passing test would appear
 * with the same color as a failing one, giving users false signals.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { StateDot } from '../StateDot';

describe('StateDot', () => {
  it('renders with --run background for pass state', () => {
    const { container } = render(<StateDot state="pass" />);
    const dot = container.firstChild as HTMLElement;
    expect(dot).toHaveStyle({ background: 'var(--run)' });
  });

  it('renders with --danger background for fail state', () => {
    const { container } = render(<StateDot state="fail" />);
    const dot = container.firstChild as HTMLElement;
    expect(dot).toHaveStyle({ background: 'var(--danger)' });
  });

  it('renders with --accent background for running state', () => {
    const { container } = render(<StateDot state="running" />);
    const dot = container.firstChild as HTMLElement;
    expect(dot).toHaveStyle({ background: 'var(--accent)' });
  });

  it('renders with --fg-subtle background for idle state', () => {
    const { container } = render(<StateDot state="idle" />);
    const dot = container.firstChild as HTMLElement;
    expect(dot).toHaveStyle({ background: 'var(--fg-subtle)' });
  });

  it('is a small inline element (6x6)', () => {
    const { container } = render(<StateDot state="pass" />);
    const dot = container.firstChild as HTMLElement;
    expect(dot).toHaveStyle({ width: '6px', height: '6px' });
  });

  it('has rounded corners via border-radius', () => {
    const { container } = render(<StateDot state="idle" />);
    const dot = container.firstChild as HTMLElement;
    // border-radius should be set (4px per design)
    expect(dot.style.borderRadius).toBeTruthy();
  });
});
