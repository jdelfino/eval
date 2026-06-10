/**
 * Unit tests for SectionLabel.
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { SectionLabel } from '../SectionLabel';

describe('SectionLabel', () => {
  it('renders children', () => {
    render(<SectionLabel>Statement</SectionLabel>);
    expect(screen.getByText('Statement')).toBeInTheDocument();
  });

  it('applies uppercase text transform', () => {
    render(<SectionLabel>Tests</SectionLabel>);
    const el = screen.getByText('Tests');
    expect(el).toHaveStyle({ textTransform: 'uppercase' });
  });

  it('accepts optional className', () => {
    render(<SectionLabel className="mb-2">Section</SectionLabel>);
    const el = screen.getByText('Section');
    expect(el).toHaveClass('mb-2');
  });

  describe('as prop', () => {
    it('renders as div by default', () => {
      const { container } = render(<SectionLabel>Default</SectionLabel>);
      const el = container.firstChild as HTMLElement;
      expect(el.tagName).toBe('DIV');
    });

    it('renders as h2 when as="h2" is specified', () => {
      render(<SectionLabel as="h2">Problems</SectionLabel>);
      const heading = screen.getByRole('heading', { name: 'Problems', level: 2 });
      expect(heading).toBeInTheDocument();
    });

    it('h2 variant preserves uppercase style', () => {
      render(<SectionLabel as="h2">Past sessions</SectionLabel>);
      const heading = screen.getByRole('heading', { name: 'Past sessions', level: 2 });
      expect(heading).toHaveStyle({ textTransform: 'uppercase' });
    });

    it('h2 variant accepts className and style props', () => {
      render(
        <SectionLabel as="h2" className="mb-3" style={{ margin: 0 }}>
          Tags
        </SectionLabel>
      );
      const heading = screen.getByRole('heading', { name: 'Tags', level: 2 });
      expect(heading).toHaveClass('mb-3');
      expect(heading).toHaveStyle({ margin: '0px' });
    });
  });
});
