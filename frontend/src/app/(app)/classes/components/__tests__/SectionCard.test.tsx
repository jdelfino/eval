import React from 'react';
import { render, screen } from '@testing-library/react';
import SectionCard from '../SectionCard';
import type { Section } from '@/server/classes/types';

// Mock next/link
jest.mock('next/link', () => {
  return ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  );
});

// Mock join code formatting
jest.mock('@/server/classes/join-code-service', () => ({
  formatJoinCodeForDisplay: (code: string) => code,
}));

// Mock fetch for instructor loading
global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ instructors: [] }),
}) as jest.Mock;

describe('SectionCard', () => {
  const mockSection: Section = {
    id: 'section-xyz',
    namespaceId: 'ns-1',
    classId: 'class-1',
    name: 'MWF 10am',
    semester: 'Fall 2025',
    joinCode: 'XYZ-789',
    active: true,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  };

  it('renders section name as a link to /sections/{sectionId}', () => {
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
