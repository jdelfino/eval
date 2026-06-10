/**
 * Unit tests for AuthHeading component.
 *
 * Verifies size map, sub paragraph, `as` element override, and heading role.
 * Mirrors sibling suites (Field/Banner/AuthCard).
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { AuthHeading } from '../AuthHeading';

describe('AuthHeading', () => {
  /**
   * Size map: lg/md/sm/xs map to 26/24/22/20px font sizes respectively.
   * If violated, heading sizes drift from the v4 design spec.
   */
  describe('size map', () => {
    it('size=lg renders with 26px font-size', () => {
      render(<AuthHeading size="lg">Heading</AuthHeading>);
      const heading = screen.getByRole('heading', { name: 'Heading' });
      expect(heading).toHaveStyle({ fontSize: '26px' });
    });

    it('size=md (default) renders with 24px font-size', () => {
      render(<AuthHeading>Heading</AuthHeading>);
      const heading = screen.getByRole('heading', { name: 'Heading' });
      expect(heading).toHaveStyle({ fontSize: '24px' });
    });

    it('size=sm renders with 22px font-size', () => {
      render(<AuthHeading size="sm">Heading</AuthHeading>);
      const heading = screen.getByRole('heading', { name: 'Heading' });
      expect(heading).toHaveStyle({ fontSize: '22px' });
    });

    it('size=xs renders with 20px font-size', () => {
      render(<AuthHeading size="xs">Heading</AuthHeading>);
      const heading = screen.getByRole('heading', { name: 'Heading' });
      expect(heading).toHaveStyle({ fontSize: '20px' });
    });
  });

  /**
   * Sub paragraph: renders with --fg-muted color when provided,
   * and is absent when omitted.
   */
  describe('sub paragraph', () => {
    it('renders sub paragraph with var(--fg-muted) color when provided', () => {
      render(<AuthHeading sub="Sub text">Heading</AuthHeading>);
      const sub = screen.getByText('Sub text');
      expect(sub).toBeInTheDocument();
      expect(sub).toHaveStyle({ color: 'var(--fg-muted)' });
    });

    it('does not render sub paragraph when sub is omitted', () => {
      render(<AuthHeading>Heading only</AuthHeading>);
      // Only the heading element, no <p> below
      const paragraphs = document.querySelectorAll('p');
      expect(paragraphs).toHaveLength(0);
    });
  });

  /**
   * `as` element override: defaults to h1, can be overridden to h2 or h3.
   */
  describe('as element override', () => {
    it('renders as h1 by default', () => {
      render(<AuthHeading>Default Heading</AuthHeading>);
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    it('renders as h2 when as="h2"', () => {
      render(<AuthHeading as="h2">Level 2</AuthHeading>);
      expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
    });

    it('renders as h3 when as="h3"', () => {
      render(<AuthHeading as="h3">Level 3</AuthHeading>);
      expect(screen.getByRole('heading', { level: 3 })).toBeInTheDocument();
    });
  });

  /**
   * Heading role is accessible — semantic heading element is present.
   */
  it('heading role is accessible', () => {
    render(<AuthHeading>Accessible Heading</AuthHeading>);
    expect(screen.getByRole('heading', { name: 'Accessible Heading' })).toBeInTheDocument();
  });

  /**
   * Children are rendered as heading text content.
   */
  it('renders children as heading content', () => {
    render(<AuthHeading>My Page Title</AuthHeading>);
    expect(screen.getByRole('heading', { name: 'My Page Title' })).toBeInTheDocument();
  });

  /**
   * style prop is forwarded to the heading element.
   */
  it('accepts additional inline style overrides', () => {
    render(<AuthHeading style={{ margin: '0 0 8px' }}>Styled</AuthHeading>);
    const heading = screen.getByRole('heading');
    expect(heading).toHaveStyle({ margin: '0px 0px 8px' });
  });
});
