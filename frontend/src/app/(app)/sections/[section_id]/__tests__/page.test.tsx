/**
 * Unit tests for SectionDetailPage
 *
 * Tests:
 * - Role-aware back button navigation (instructor vs student)
 * - Error-state back button fallbacks
 * - Past session view button routes by role
 * - Past session metadata display
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter, useParams } from 'next/navigation';
import SectionDetailPage from '../page';
import { useAuth } from '@/contexts/AuthContext';
import { getSection, getActiveSessions } from '@/lib/api/sections';
import { getClass } from '@/lib/api/classes';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useParams: jest.fn(),
}));

// Mock AuthContext
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

// Mock API modules
jest.mock('@/lib/api/sections', () => ({
  getSection: jest.fn(),
  getActiveSessions: jest.fn(),
}));

jest.mock('@/lib/api/classes', () => ({
  getClass: jest.fn(),
}));

const mockPush = jest.fn();
const CLASS_ID = 'class-abc-123';
const SECTION_ID = 'section-xyz-789';

const pastSession = {
  id: 'session-past-1',
  namespace_id: 'ns-1',
  section_id: SECTION_ID,
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

function mockSectionData(sessions: object[] = []) {
  (getSection as jest.Mock).mockResolvedValue({
    id: SECTION_ID,
    name: 'Section A',
    class_id: CLASS_ID,
    semester: 'Fall 2025',
    namespace_id: 'ns-1',
    join_code: 'ABC-123',
    active: true,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  });
  (getActiveSessions as jest.Mock).mockResolvedValue(sessions);
  (getClass as jest.Mock).mockResolvedValue({
    class: {
      id: CLASS_ID,
      name: 'Intro to CS',
      description: 'A great class',
      namespace_id: 'ns-1',
      created_by: 'user-1',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    },
    sections: [],
    instructorNames: {},
    sectionInstructors: {},
  });
}

function mockUser(role: string) {
  (useAuth as jest.Mock).mockReturnValue({
    user: { id: 'user-1', email: 'test@example.com', role },
    isLoading: false,
  });
}

describe('SectionDetailPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
    (useParams as jest.Mock).mockReturnValue({ section_id: SECTION_ID });
  });

  describe('main back button (section loaded)', () => {
    it('shows "Back to Class" linking to /classes/{classId} for instructor role', async () => {
      mockUser('instructor');
      mockSectionData();

      render(<SectionDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Intro to CS')).toBeInTheDocument();
      });

      const backLink = screen.getByText('Back to Class').closest('a');
      expect(backLink).toHaveAttribute('href', `/classes/${CLASS_ID}`);
    });

    it('shows "Back to Class" linking to /classes/{classId} for namespace-admin role', async () => {
      mockUser('namespace-admin');
      mockSectionData();

      render(<SectionDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Intro to CS')).toBeInTheDocument();
      });

      const backLink = screen.getByText('Back to Class').closest('a');
      expect(backLink).toHaveAttribute('href', `/classes/${CLASS_ID}`);
    });

    it('shows "Back to Class" linking to /classes/{classId} for system-admin role', async () => {
      mockUser('system-admin');
      mockSectionData();

      render(<SectionDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Intro to CS')).toBeInTheDocument();
      });

      const backLink = screen.getByText('Back to Class').closest('a');
      expect(backLink).toHaveAttribute('href', `/classes/${CLASS_ID}`);
    });

    it('shows "Back to Home" linking to / for student role', async () => {
      mockUser('student');
      mockSectionData();

      render(<SectionDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Intro to CS')).toBeInTheDocument();
      });

      const backLink = screen.getByText('Back to Home').closest('a');
      expect(backLink).toHaveAttribute('href', '/');
    });
  });

  describe('error-state back button', () => {
    beforeEach(() => {
      (getSection as jest.Mock).mockRejectedValue(new Error('Not found'));
      (getActiveSessions as jest.Mock).mockResolvedValue([]);
    });

    it('shows "Back to Classes" linking to /classes for instructor role on error', async () => {
      mockUser('instructor');

      render(<SectionDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Not found')).toBeInTheDocument();
      });

      const backLink = screen.getByText('Back to Classes').closest('a');
      expect(backLink).toHaveAttribute('href', '/classes');
    });

    it('shows "Back to Home" linking to / for student role on error', async () => {
      mockUser('student');

      render(<SectionDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Not found')).toBeInTheDocument();
      });

      const backLink = screen.getByText('Back to Home').closest('a');
      expect(backLink).toHaveAttribute('href', '/');
    });
  });

  describe('past session navigation', () => {
    it('shows View button that navigates instructors to instructor session view', async () => {
      mockUser('instructor');
      mockSectionData([pastSession]);

      render(<SectionDetailPage />);

      const viewBtn = await screen.findByText('View');
      await userEvent.click(viewBtn);

      expect(mockPush).toHaveBeenCalledWith('/instructor/session/session-past-1');
    });

    it('shows View button that navigates students to student view', async () => {
      mockUser('student');
      mockSectionData([pastSession]);

      render(<SectionDetailPage />);

      const viewBtn = await screen.findByText('View');
      await userEvent.click(viewBtn);

      expect(mockPush).toHaveBeenCalledWith('/student?session_id=session-past-1');
    });

    it('does not show Reopen button on section detail page', async () => {
      mockUser('instructor');
      mockSectionData([pastSession]);

      render(<SectionDetailPage />);

      expect(await screen.findByText('Past Problem')).toBeInTheDocument();
      expect(screen.queryByText('Reopen')).not.toBeInTheDocument();
    });

    it('shows student count on past sessions', async () => {
      mockUser('instructor');
      mockSectionData([pastSession]);

      render(<SectionDetailPage />);

      expect(await screen.findByText('2 students')).toBeInTheDocument();
    });
  });
});
