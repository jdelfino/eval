/**
 * Unit tests for Kbd component
 * @jest-environment jsdom
 *
 * Verifies Kbd renders inside a semantic <kbd> element.
 * If the semantic element is missing, screen-readers and keyboard
 * shortcut parsers lose context about what's being displayed.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { Kbd } from '../Kbd';

describe('Kbd', () => {
  it('renders children inside a semantic kbd element', () => {
    render(<Kbd>⌘1</Kbd>);
    // screen.getByRole does not have a role for kbd, so query by tag name
    const kbdEl = document.querySelector('kbd');
    expect(kbdEl).toBeInTheDocument();
    expect(kbdEl).toHaveTextContent('⌘1');
  });

  it('renders text content correctly', () => {
    render(<Kbd>Ctrl+K</Kbd>);
    expect(screen.getByText('Ctrl+K')).toBeInTheDocument();
  });

  it('applies border styling using CSS variables', () => {
    render(<Kbd>Enter</Kbd>);
    const kbdEl = document.querySelector('kbd') as HTMLElement;
    expect(kbdEl).not.toBeNull();
    // Border should reference --border token
    expect(kbdEl.style.border).toContain('var(--border)');
  });

  it('applies bg-sunken background', () => {
    render(<Kbd>Esc</Kbd>);
    const kbdEl = document.querySelector('kbd') as HTMLElement;
    expect(kbdEl).toHaveStyle({ background: 'var(--bg-sunken)' });
  });

  it('uses monospace font family', () => {
    render(<Kbd>⌥⇧K</Kbd>);
    const kbdEl = document.querySelector('kbd') as HTMLElement;
    expect(kbdEl).toHaveStyle({ fontFamily: 'var(--font-mono)' });
  });
});
