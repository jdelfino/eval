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
});
