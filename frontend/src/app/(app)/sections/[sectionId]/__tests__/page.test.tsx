/**
 * Unit tests for SectionDetailPage
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SectionDetailPage from '../page';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useParams: () => ({ section_id: 'section-1' }),
}));

const mockUseAuth = jest.fn();
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/components/ui/BackButton', () => ({
  BackButton: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

jest.mock('@/lib/api/sections');

const pastSession = {
  id: 'session-past-1',
  namespace_id: 'namespace-1',
  section_id: 'section-1',
  section_name: 'Section A',
  status: 'completed',
  created_at: '2026-01-15T10:00:00Z',
  last_activity: '2026-01-15T10:00:00Z',
  ended_at: '2026-01-15T11:00:00Z',
  problem: { title: 'Past Problem', description: 'A completed problem' },
  participants: ['student-1', 'student-2'],
  featured_student_id: null,
  featured_code: null,
  creator_id: 'user-1',
};

function mockApiForRole(role: 'instructor' | 'student', sessions: object[] = [pastSession]) {
  const { listMySections, getActiveSessions } = require('@/lib/api/sections');

  listMySections.mockResolvedValue([
    {
      section: {
        id: 'section-1',
        namespace_id: 'namespace-1',
        class_id: 'class-1',
        name: 'Section A',
        semester: 'Fall 2026',
        join_code: 'ABC123',
        active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      class_name: 'CS 101',
    },
  ]);

  getActiveSessions.mockResolvedValue(sessions);
}

describe('SectionDetailPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default to instructor role
    mockUseAuth.mockReturnValue({
      user: { id: 'user-1', email: 'test@example.com', role: 'instructor' },
      isLoading: false,
    });
  });

  it('shows View button that navigates instructors to instructor session view', async () => {
    mockApiForRole('instructor');
    render(<SectionDetailPage />);

    const viewBtn = await screen.findByText('View');
    await userEvent.click(viewBtn);

    expect(mockPush).toHaveBeenCalledWith('/instructor/session/session-past-1');
  });

  it('shows View button that navigates students to student view', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user-1', email: 'test@example.com', role: 'student' },
      isLoading: false,
    });
    mockApiForRole('student');
    render(<SectionDetailPage />);

    const viewBtn = await screen.findByText('View');
    await userEvent.click(viewBtn);

    expect(mockPush).toHaveBeenCalledWith('/student?session_id=session-past-1');
  });

  it('does not show Reopen button on section detail page', async () => {
    mockApiForRole('instructor');
    render(<SectionDetailPage />);
    expect(await screen.findByText('Past Problem')).toBeInTheDocument();
    expect(screen.queryByText('Reopen')).not.toBeInTheDocument();
  });

  it('shows student count on past sessions', async () => {
    mockApiForRole('instructor');
    render(<SectionDetailPage />);
    expect(await screen.findByText('2 students')).toBeInTheDocument();
  });
});
