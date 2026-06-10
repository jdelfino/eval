/**
 * Unit tests for AuthCard component.
 *
 * Verifies that AuthCard encapsulates the shared auth-card recipe (bg-raised,
 * border, radius-lg, padding) so T3/T4/T5 don't hand-roll it inline.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { AuthCard } from '../AuthCard';

describe('AuthCard', () => {
  it('renders children', () => {
    render(<AuthCard><p>Card content</p></AuthCard>);
    expect(screen.getByText('Card content')).toBeInTheDocument();
  });

  it('carries var(--bg-raised) background', () => {
    const { container } = render(<AuthCard><p>content</p></AuthCard>);
    const card = container.firstChild as HTMLElement;
    expect(card.style.background).toBe('var(--bg-raised)');
  });

  it('carries var(--border) border', () => {
    const { container } = render(<AuthCard><p>content</p></AuthCard>);
    const card = container.firstChild as HTMLElement;
    expect(card.style.border).toContain('var(--border)');
  });

  it('carries var(--radius-lg) border-radius', () => {
    const { container } = render(<AuthCard><p>content</p></AuthCard>);
    const card = container.firstChild as HTMLElement;
    expect(card.style.borderRadius).toBe('var(--radius-lg)');
  });

  it('accepts additional style overrides', () => {
    const { container } = render(<AuthCard style={{ marginTop: 30 }}><p>content</p></AuthCard>);
    const card = container.firstChild as HTMLElement;
    expect(card.style.marginTop).toBe('30px');
  });
});
