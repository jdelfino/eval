/**
 * Unit tests for IconBtn component
 * @jest-environment jsdom
 *
 * Verifies that IconBtn is accessible (aria-label/title), fires onClick,
 * and applies active styling. Catches: broken handler wiring, missing aria
 * attributes, and ignored active prop — all of which affect usability in
 * the Sidebar and AppBarLite toolbar.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IconBtn } from '../IconBtn';

describe('IconBtn', () => {
  /**
   * title prop must become both the HTML title attribute and aria-label on the button
   * so screen readers and tooltip-on-hover both identify the icon action.
   */
  it('accessible name via title prop — button found by accessible name', () => {
    render(<IconBtn icon="settings" title="Open settings" />);
    const btn = screen.getByRole('button', { name: 'Open settings' });
    expect(btn).toBeInTheDocument();
    // SVG must be rendered inside the button
    expect(btn.querySelector('svg')).not.toBeNull();
  });

  /**
   * onClick handler must fire exactly once per click.
   * Catches event handler not wired in the button element.
   */
  it('onClick fires once when clicked', async () => {
    const handleClick = jest.fn();
    const user = userEvent.setup();
    render(<IconBtn icon="settings" title="Settings" onClick={handleClick} />);
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  /**
   * active=true must produce a non-transparent background and a non-transparent border.
   * Catches the active prop being ignored, which means active sidebar items look identical
   * to inactive ones — breaking navigation affordance.
   */
  it('active=true applies non-transparent background and border', () => {
    render(<IconBtn icon="settings" title="Settings" active />);
    const btn = screen.getByRole('button', { name: 'Settings' });
    // active background should be var(--bg-sunken), not transparent
    expect(btn.style.background).not.toBe('transparent');
    expect(btn.style.background).toBeTruthy();
    // active border should reference var(--border), not be transparent
    expect(btn.style.border).not.toContain('transparent');
  });
});
