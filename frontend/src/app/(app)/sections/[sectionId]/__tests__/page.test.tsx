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
  useParams: () => ({ sectionId: 'section-1' }),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'test@example.com' }, isLoading: false }),
}));

jest.mock('@/components/ui/BackButton', () => ({
  BackButton: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const pastSession = {
  id: 'session-past-1',
  status: 'completed',
  createdAt: '2026-01-15T10:00:00Z',
  problem: { title: 'Past Problem', description: 'A completed problem' },
  participants: ['student-1', 'student-2'],
};

function mockSectionFetch(role: 'instructor' | 'student', sessions: object[] = [pastSession]) {
  return (url: string) => {
    if (url === '/api/sections/my') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          sections: [{
            id: 'section-1', name: 'Section A', className: 'CS 101',
            classDescription: 'Intro', semester: 'Fall 2026', role,
          }],
        }),
      });
    }
    if (url === '/api/sections/section-1/sessions') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ sessions }),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  };
}

describe('SectionDetailPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows View button that navigates instructors to instructor session view', async () => {
    global.fetch = jest.fn(mockSectionFetch('instructor')) as jest.Mock;
    render(<SectionDetailPage />);

    const viewBtn = await screen.findByText('View');
    await userEvent.click(viewBtn);

    expect(mockPush).toHaveBeenCalledWith('/instructor/session/session-past-1');
  });

  it('shows View button that navigates students to student view', async () => {
    global.fetch = jest.fn(mockSectionFetch('student')) as jest.Mock;
    render(<SectionDetailPage />);

    const viewBtn = await screen.findByText('View');
    await userEvent.click(viewBtn);

    expect(mockPush).toHaveBeenCalledWith('/student?sessionId=session-past-1');
  });

  it('does not show Reopen button on section detail page', async () => {
    global.fetch = jest.fn(mockSectionFetch('instructor')) as jest.Mock;
    render(<SectionDetailPage />);
    expect(await screen.findByText('Past Problem')).toBeInTheDocument();
    expect(screen.queryByText('Reopen')).not.toBeInTheDocument();
  });

  it('shows student count on past sessions', async () => {
    global.fetch = jest.fn(mockSectionFetch('instructor')) as jest.Mock;
    render(<SectionDetailPage />);
    expect(await screen.findByText('2 students')).toBeInTheDocument();
  });
});
