/**
 * Unit tests for Icon component
 * @jest-environment jsdom
 *
 * Verifies that Icon renders the correct SVG path for all named icons,
 * returns null for unknown names, and respects the size prop.
 * Regressions here mean missing ICON_PATHS entries silently render blank
 * glyphs, or the size prop is dropped — breaking layout across Sidebar and AppBarLite.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { Icon } from '../Icon';
import type { IconName } from '../Icon';

const ALL_ICON_NAMES: IconName[] = [
  'home', 'layers', 'book', 'users', 'zap', 'search', 'chevR', 'chevL',
  'chevD', 'chevU', 'plus', 'x', 'check', 'alert', 'info', 'play', 'pause',
  'square', 'menu', 'more', 'settings', 'bell', 'lock', 'globe', 'copy',
  'edit', 'trash', 'download', 'arrowR', 'arrowL', 'upload', 'refresh',
  'wifi', 'link', 'flag', 'send', 'filter', 'sort', 'eye', 'history', 'star',
];

describe('Icon', () => {
  /**
   * Parameterized: every named icon must render a <path> with a non-empty `d` attribute.
   * Catches missing ICON_PATHS entries that would silently render blank glyphs.
   */
  it.each(ALL_ICON_NAMES)('renders SVG path for icon name "%s"', (name) => {
    const { container } = render(<Icon name={name} />);
    const path = container.querySelector('path');
    expect(path).not.toBeNull();
    expect(path!.getAttribute('d')).toBeTruthy();
  });

  /**
   * Unknown names must return null (no DOM node), not an empty SVG.
   * Catches cases where the component throws or silently renders an empty wrapper.
   */
  it('returns null for unknown icon name', () => {
    const { container } = render(<Icon name={'nonexistent' as IconName} />);
    expect(container.firstChild).toBeNull();
  });

  /**
   * The size prop must control SVG width and height attributes.
   * Catches prop being dropped, which breaks layout in icon-dense UIs.
   */
  it('respects size prop — SVG width and height equal size', () => {
    const { container } = render(<Icon name="home" size={20} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('width')).toBe('20');
    expect(svg!.getAttribute('height')).toBe('20');
  });
});
