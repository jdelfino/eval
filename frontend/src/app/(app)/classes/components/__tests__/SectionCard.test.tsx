import React from 'react';
import { render, screen } from '@testing-library/react';
import SectionCard from '../SectionCard';
import type { Section } from '@/types/api';

// Mock next/link
jest.mock('next/link', () => {
  return ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  );
});

// Mock join code formatting
jest.mock('@/lib/join-code', () => ({
  formatJoinCodeForDisplay: (code: string) => code,
}));

describe('SectionCard', () => {
  const mockSection: Section = {
    id: 'section-xyz',
    namespace_id: 'ns-1',
    class_id: 'class-1',
    name: 'MWF 10am',
    semester: 'Fall 2025',
    join_code: 'XYZ-789',
    active: true,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  };

  it('renders section name as a link to /sections/{section_id}', () => {
    render(<SectionCard section={mockSection} />);

    const link = screen.getByTestId('section-link-section-xyz');
    expect(link).toHaveAttribute('href', '/sections/section-xyz');
    expect(link).toHaveTextContent('MWF 10am');
  });

  it('renders section semester', () => {
    render(<SectionCard section={mockSection} />);
    expect(screen.getByText('Fall 2025')).toBeInTheDocument();
  });
});
