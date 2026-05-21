/**
 * Unit tests for ConnectionDot component
 * @jest-environment jsdom
 *
 * Verifies status→label mapping, compact mode (no label), and status→color
 * CSS token mapping. Regressions here mean the wrong label or color signals
 * are shown to users — e.g., "Offline" in green or "Live" with no label.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { ConnectionDot } from '../ConnectionDot';
import type { ConnectionStatus } from '../ConnectionDot';

describe('ConnectionDot', () => {
  /**
   * Each status must render its expected human-readable label in full variant.
   * Catches label drift when status constants or map entries are renamed.
   */
  it.each<[ConnectionStatus, string]>([
    ['live',    'Live'],
    ['warming', 'Warming up'],
    ['offline', 'Offline'],
    ['idle',    'Idle'],
  ])('status "%s" renders label "%s"', (status, label) => {
    const { container } = render(<ConnectionDot status={status} />);
    expect(container.textContent).toContain(label);
  });

  /**
   * compact=true must render no text label — only the dot indicator.
   * Catches the compact branch being broken (label shown when it shouldn't be).
   */
  it('compact=true renders no text label', () => {
    const { container } = render(<ConnectionDot status="live" compact />);
    const span = container.firstChild as HTMLElement;
    expect(span).not.toBeNull();
    // No text content in compact mode
    expect(span.textContent?.trim()).toBe('');
  });

  /**
   * Each status must apply the correct CSS color token to the pill wrapper.
   * Catches status→color drift: e.g. offline rendered in green (--run) instead of red (--danger).
   */
  it.each<[ConnectionStatus, string]>([
    ['live',    'var(--run)'],
    ['warming', 'var(--warn)'],
    ['offline', 'var(--danger)'],
    ['idle',    'var(--fg-subtle)'],
  ])('status "%s" renders with color %s', (status, expectedColor) => {
    const { container } = render(<ConnectionDot status={status} />);
    const pill = container.firstChild as HTMLElement;
    expect(pill).not.toBeNull();
    expect(pill.style.color).toBe(expectedColor);
  });
});
