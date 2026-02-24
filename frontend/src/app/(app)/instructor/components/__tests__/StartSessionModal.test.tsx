/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StartSessionModal from '../StartSessionModal';
import * as problemsApi from '@/lib/api/problems';
import * as sessionsApi from '@/lib/api/sessions';
import * as sectionProblemsApi from '@/lib/api/section-problems';

// Mock next/navigation
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock API modules
jest.mock('@/lib/api/problems');
jest.mock('@/lib/api/sessions');
jest.mock('@/lib/api/section-problems');

describe('StartSessionModal', () => {
  const mockOnClose = jest.fn();
  const mockOnSessionCreated = jest.fn();
  const section_id = 'section-123';
  const section_name = 'Section A';

  const mockProblems = [
    { id: 'problem-1', title: 'FizzBuzz', description: null, author_id: 'u-1', class_id: 'c-1', tags: [], created_at: '2025-01-01', test_case_count: null },
    { id: 'problem-2', title: 'Two Sum', description: null, author_id: 'u-1', class_id: 'c-1', tags: [], created_at: '2025-01-01', test_case_count: null },
    { id: 'problem-3', title: 'Binary Search', description: null, author_id: 'u-1', class_id: 'c-1', tags: [], created_at: '2025-01-01', test_case_count: null },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no published sections for any problem
    (sectionProblemsApi.listProblemSections as jest.Mock).mockResolvedValue([]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('renders the modal with title and section name', async () => {
      jest.spyOn(problemsApi, 'listProblems').mockResolvedValueOnce(mockProblems);

      render(
        <StartSessionModal
          section_id={section_id}
          section_name={section_name}
          onClose={mockOnClose}
          onSessionCreated={mockOnSessionCreated}
        />
      );

      expect(screen.getByRole('heading', { name: 'Start Session' })).toBeInTheDocument();
      expect(screen.getByText(section_name)).toBeInTheDocument();
    });

    it('shows loading state while fetching problems', () => {
      jest.spyOn(problemsApi, 'listProblems').mockImplementationOnce(
        () => new Promise(() => {}) // Never resolves
      );

      render(
        <StartSessionModal
          section_id={section_id}
          section_name={section_name}
          onClose={mockOnClose}
          onSessionCreated={mockOnSessionCreated}
        />
      );

      expect(screen.getByText(/loading problems/i)).toBeInTheDocument();
    });

    it('displays problem list after loading', async () => {
      jest.spyOn(problemsApi, 'listProblems').mockResolvedValueOnce(mockProblems);

      render(
        <StartSessionModal
          section_id={section_id}
          section_name={section_name}
          onClose={mockOnClose}
          onSessionCreated={mockOnSessionCreated}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('FizzBuzz')).toBeInTheDocument();
        expect(screen.getByText('Two Sum')).toBeInTheDocument();
        expect(screen.getByText('Binary Search')).toBeInTheDocument();
      });
    });

    it('shows Create blank session option', async () => {
      jest.spyOn(problemsApi, 'listProblems').mockResolvedValueOnce(mockProblems);

      render(
        <StartSessionModal
          section_id={section_id}
          section_name={section_name}
          onClose={mockOnClose}
          onSessionCreated={mockOnSessionCreated}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/create blank session/i)).toBeInTheDocument();
      });
    });

    it('shows Cancel and Start Session buttons', async () => {
      jest.spyOn(problemsApi, 'listProblems').mockResolvedValueOnce(mockProblems);

      render(
        <StartSessionModal
          section_id={section_id}
          section_name={section_name}
          onClose={mockOnClose}
          onSessionCreated={mockOnSessionCreated}
        />
      );

      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /start session/i })).toBeInTheDocument();
    });
  });

  describe('Modal interactions', () => {
    it('closes modal when cancel button is clicked', async () => {
      jest.spyOn(problemsApi, 'listProblems').mockResolvedValueOnce(mockProblems);

      render(
        <StartSessionModal
          section_id={section_id}
          section_name={section_name}
          onClose={mockOnClose}
          onSessionCreated={mockOnSessionCreated}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('closes modal when clicking outside the modal content', async () => {
      jest.spyOn(problemsApi, 'listProblems').mockResolvedValueOnce(mockProblems);

      render(
        <StartSessionModal
          section_id={section_id}
          section_name={section_name}
          onClose={mockOnClose}
          onSessionCreated={mockOnSessionCreated}
        />
      );

      const backdrop = screen.getByTestId('modal-backdrop');
      fireEvent.click(backdrop);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('does not close modal when clicking inside the modal content', async () => {
      jest.spyOn(problemsApi, 'listProblems').mockResolvedValueOnce(mockProblems);

      render(
        <StartSessionModal
          section_id={section_id}
          section_name={section_name}
          onClose={mockOnClose}
          onSessionCreated={mockOnSessionCreated}
        />
      );

      const modalContent = screen.getByTestId('modal-content');
      fireEvent.click(modalContent);

      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('closes modal when X button is clicked', async () => {
      jest.spyOn(problemsApi, 'listProblems').mockResolvedValueOnce(mockProblems);

      render(
        <StartSessionModal
          section_id={section_id}
          section_name={section_name}
          onClose={mockOnClose}
          onSessionCreated={mockOnSessionCreated}
        />
      );

      // Find the X button by its aria-label
      const closeButton = screen.getByRole('button', { name: /close/i });
      fireEvent.click(closeButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Problem selection', () => {
    it('allows selecting a problem from the list', async () => {
      jest.spyOn(problemsApi, 'listProblems').mockResolvedValueOnce(mockProblems);

      render(
        <StartSessionModal
          section_id={section_id}
          section_name={section_name}
          onClose={mockOnClose}
          onSessionCreated={mockOnSessionCreated}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('FizzBuzz')).toBeInTheDocument();
      });

      // Click on a problem to select it
      fireEvent.click(screen.getByText('FizzBuzz'));

      // Check that the problem is now selected (highlighted)
      const fizzBuzzElement = screen.getByText('FizzBuzz').closest('button');
      expect(fizzBuzzElement).toHaveClass('border-blue-500');
    });

    it('allows selecting blank session option', async () => {
      jest.spyOn(problemsApi, 'listProblems').mockResolvedValueOnce(mockProblems);

      render(
        <StartSessionModal
          section_id={section_id}
          section_name={section_name}
          onClose={mockOnClose}
          onSessionCreated={mockOnSessionCreated}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/create blank session/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/create blank session/i));

      const blankOption = screen.getByText(/create blank session/i).closest('button');
      expect(blankOption).toHaveClass('border-blue-500');
    });
  });

  describe('Session creation', () => {
    it('creates session with selected problem', async () => {
      jest.spyOn(problemsApi, 'listProblems').mockResolvedValueOnce(mockProblems);
      jest.spyOn(sessionsApi, 'createSession').mockResolvedValueOnce({
        id: 'session-123',
        namespace_id: 'ns-1',
        section_id: section_id,
        section_name: section_name,
        problem: null,
        featured_student_id: null,
        featured_code: null,
        creator_id: 'user-1',
        participants: [],
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        last_activity: '2024-01-01T00:00:00Z',
        ended_at: null,
      });

      render(
        <StartSessionModal
          section_id={section_id}
          section_name={section_name}
          onClose={mockOnClose}
          onSessionCreated={mockOnSessionCreated}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('FizzBuzz')).toBeInTheDocument();
      });

      // Select a problem
      fireEvent.click(screen.getByText('FizzBuzz'));

      // Click Start Session
      fireEvent.click(screen.getByRole('button', { name: /start session/i }));

      await waitFor(() => {
        // Now passes showSolution=false (default) since problem is not published to section
        expect(sessionsApi.createSession).toHaveBeenCalledWith(section_id, 'problem-1', false);
      });

      expect(mockOnSessionCreated).toHaveBeenCalledWith('session-123');
      expect(mockPush).toHaveBeenCalledWith('/instructor/session/session-123');
    });

    it('creates blank session when no problem selected', async () => {
      jest.spyOn(problemsApi, 'listProblems').mockResolvedValueOnce(mockProblems);
      jest.spyOn(sessionsApi, 'createSession').mockResolvedValueOnce({
        id: 'session-456',
        namespace_id: 'ns-1',
        section_id: section_id,
        section_name: section_name,
        problem: null,
        featured_student_id: null,
        featured_code: null,
        creator_id: 'user-1',
        participants: [],
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        last_activity: '2024-01-01T00:00:00Z',
        ended_at: null,
      });

      render(
        <StartSessionModal
          section_id={section_id}
          section_name={section_name}
          onClose={mockOnClose}
          onSessionCreated={mockOnSessionCreated}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/create blank session/i)).toBeInTheDocument();
      });

      // Select blank session option
      fireEvent.click(screen.getByText(/create blank session/i));

      // Click Start Session
      fireEvent.click(screen.getByRole('button', { name: /start session/i }));

      await waitFor(() => {
        // Blank session: no problem_id, no showSolution
        expect(sessionsApi.createSession).toHaveBeenCalledWith(section_id, undefined, undefined);
      });

      expect(mockOnSessionCreated).toHaveBeenCalledWith('session-456');
      expect(mockPush).toHaveBeenCalledWith('/instructor/session/session-456');
    });

    it('shows loading state while creating session', async () => {
      jest.spyOn(problemsApi, 'listProblems').mockResolvedValueOnce(mockProblems);
      jest.spyOn(sessionsApi, 'createSession').mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  id: 'session-123',
                  namespace_id: 'ns-1',
                  section_id: section_id,
                  section_name: section_name,
                  problem: null,
                  featured_student_id: null,
                  featured_code: null,
                  creator_id: 'user-1',
                  participants: [],
                  status: 'active',
                  created_at: '2024-01-01T00:00:00Z',
                  last_activity: '2024-01-01T00:00:00Z',
                  ended_at: null,
                }),
              100
            )
          )
      );

      render(
        <StartSessionModal
          section_id={section_id}
          section_name={section_name}
          onClose={mockOnClose}
          onSessionCreated={mockOnSessionCreated}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/create blank session/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/create blank session/i));
      fireEvent.click(screen.getByRole('button', { name: /start session/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /creating/i })).toBeDisabled();
      });

      await waitFor(() => {
        expect(mockOnSessionCreated).toHaveBeenCalled();
      });
    });

    it('disables buttons during session creation', async () => {
      jest.spyOn(problemsApi, 'listProblems').mockResolvedValueOnce(mockProblems);
      jest.spyOn(sessionsApi, 'createSession').mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  id: 'session-123',
                  namespace_id: 'ns-1',
                  section_id: section_id,
                  section_name: section_name,
                  problem: null,
                  featured_student_id: null,
                  featured_code: null,
                  creator_id: 'user-1',
                  participants: [],
                  status: 'active',
                  created_at: '2024-01-01T00:00:00Z',
                  last_activity: '2024-01-01T00:00:00Z',
                  ended_at: null,
                }),
              100
            )
          )
      );

      render(
        <StartSessionModal
          section_id={section_id}
          section_name={section_name}
          onClose={mockOnClose}
          onSessionCreated={mockOnSessionCreated}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/create blank session/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/create blank session/i));
      fireEvent.click(screen.getByRole('button', { name: /start session/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
      });

      await waitFor(() => {
        expect(mockOnSessionCreated).toHaveBeenCalled();
      });
    });

    it('does not close modal during session creation', async () => {
      jest.spyOn(problemsApi, 'listProblems').mockResolvedValueOnce(mockProblems);
      jest.spyOn(sessionsApi, 'createSession').mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  id: 'session-123',
                  namespace_id: 'ns-1',
                  section_id: section_id,
                  section_name: section_name,
                  problem: null,
                  featured_student_id: null,
                  featured_code: null,
                  creator_id: 'user-1',
                  participants: [],
                  status: 'active',
                  created_at: '2024-01-01T00:00:00Z',
                  last_activity: '2024-01-01T00:00:00Z',
                  ended_at: null,
                }),
              100
            )
          )
      );

      render(
        <StartSessionModal
          section_id={section_id}
          section_name={section_name}
          onClose={mockOnClose}
          onSessionCreated={mockOnSessionCreated}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/create blank session/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/create blank session/i));
      fireEvent.click(screen.getByRole('button', { name: /start session/i }));

      // Try to close while loading
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      expect(mockOnClose).not.toHaveBeenCalled();

      await waitFor(() => {
        expect(mockOnSessionCreated).toHaveBeenCalled();
      });
    });
  });

  describe('Error handling', () => {
    it('shows error when problems fail to load', async () => {
      jest.spyOn(problemsApi, 'listProblems').mockRejectedValueOnce(
        new Error('Failed to load problems')
      );

      render(
        <StartSessionModal
          section_id={section_id}
          section_name={section_name}
          onClose={mockOnClose}
          onSessionCreated={mockOnSessionCreated}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/failed to load problems/i)).toBeInTheDocument();
      });
    });

    it('shows error when session creation fails', async () => {
      jest.spyOn(problemsApi, 'listProblems').mockResolvedValueOnce(mockProblems);
      jest.spyOn(sessionsApi, 'createSession').mockRejectedValueOnce(
        new Error('Failed to create session')
      );

      render(
        <StartSessionModal
          section_id={section_id}
          section_name={section_name}
          onClose={mockOnClose}
          onSessionCreated={mockOnSessionCreated}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/create blank session/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/create blank session/i));
      fireEvent.click(screen.getByRole('button', { name: /start session/i }));

      await waitFor(() => {
        expect(screen.getByText(/failed to create session/i)).toBeInTheDocument();
      });

      expect(mockOnSessionCreated).not.toHaveBeenCalled();
    });

    it('shows network error message', async () => {
      jest.spyOn(problemsApi, 'listProblems').mockResolvedValueOnce(mockProblems);
      jest.spyOn(sessionsApi, 'createSession').mockRejectedValueOnce(
        new Error('Network error')
      );

      render(
        <StartSessionModal
          section_id={section_id}
          section_name={section_name}
          onClose={mockOnClose}
          onSessionCreated={mockOnSessionCreated}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/create blank session/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/create blank session/i));
      fireEvent.click(screen.getByRole('button', { name: /start session/i }));

      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeInTheDocument();
      });

      expect(mockOnSessionCreated).not.toHaveBeenCalled();
    });

    it('requires a selection before starting session', async () => {
      jest.spyOn(problemsApi, 'listProblems').mockResolvedValueOnce(mockProblems);

      render(
        <StartSessionModal
          section_id={section_id}
          section_name={section_name}
          onClose={mockOnClose}
          onSessionCreated={mockOnSessionCreated}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('FizzBuzz')).toBeInTheDocument();
      });

      // Button should be disabled without selection
      const startButton = screen.getByRole('button', { name: /start session/i });
      expect(startButton).toBeDisabled();
    });
  });

  describe('Empty state', () => {
    it('shows message when no problems available', async () => {
      jest.spyOn(problemsApi, 'listProblems').mockResolvedValueOnce([]);

      render(
        <StartSessionModal
          section_id={section_id}
          section_name={section_name}
          onClose={mockOnClose}
          onSessionCreated={mockOnSessionCreated}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/no problems available/i)).toBeInTheDocument();
      });

      // But blank session option should still be available
      expect(screen.getByText(/create blank session/i)).toBeInTheDocument();
    });
  });

  describe('Publish UX', () => {
    it('does not show publish UX when blank session is selected', async () => {
      jest.spyOn(problemsApi, 'listProblems').mockResolvedValueOnce(mockProblems);

      render(
        <StartSessionModal
          section_id={section_id}
          section_name={section_name}
          onClose={mockOnClose}
          onSessionCreated={mockOnSessionCreated}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/create blank session/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/create blank session/i));

      expect(screen.queryByText(/publish to section/i)).not.toBeInTheDocument();
    });

    it('shows publish info box when selected problem is not published to section', async () => {
      jest.spyOn(problemsApi, 'listProblems').mockResolvedValueOnce(mockProblems);
      // problem NOT published to this section
      jest.spyOn(sectionProblemsApi, 'listProblemSections').mockResolvedValueOnce([]);

      render(
        <StartSessionModal
          section_id={section_id}
          section_name={section_name}
          onClose={mockOnClose}
          onSessionCreated={mockOnSessionCreated}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('FizzBuzz')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('FizzBuzz'));

      await waitFor(() => {
        expect(screen.getByText(/publish to section/i)).toBeInTheDocument();
      });
    });

    it('shows "Already published" when selected problem is published to section', async () => {
      jest.spyOn(problemsApi, 'listProblems').mockResolvedValueOnce(mockProblems);
      // problem IS published to this section
      jest.spyOn(sectionProblemsApi, 'listProblemSections').mockResolvedValueOnce([
        { id: 'sp-1', section_id: section_id, problem_id: 'problem-1', published_by: 'u-1', show_solution: false, published_at: '2025-01-01T00:00:00Z' },
      ]);

      render(
        <StartSessionModal
          section_id={section_id}
          section_name={section_name}
          onClose={mockOnClose}
          onSessionCreated={mockOnSessionCreated}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('FizzBuzz')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('FizzBuzz'));

      await waitFor(() => {
        expect(screen.getByText(/already published to this section/i)).toBeInTheDocument();
      });
    });

    it('passes showSolution to createSession when problem is not published', async () => {
      jest.spyOn(problemsApi, 'listProblems').mockResolvedValueOnce(mockProblems);
      jest.spyOn(sectionProblemsApi, 'listProblemSections').mockResolvedValueOnce([]);
      jest.spyOn(sessionsApi, 'createSession').mockResolvedValueOnce({
        id: 'session-123',
        namespace_id: 'ns-1',
        section_id: section_id,
        section_name: section_name,
        problem: null,
        featured_student_id: null,
        featured_code: null,
        creator_id: 'user-1',
        participants: [],
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        last_activity: '2024-01-01T00:00:00Z',
        ended_at: null,
      });

      render(
        <StartSessionModal
          section_id={section_id}
          section_name={section_name}
          onClose={mockOnClose}
          onSessionCreated={mockOnSessionCreated}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('FizzBuzz')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('FizzBuzz'));

      await waitFor(() => {
        expect(screen.getByRole('checkbox', { name: /show solution/i })).toBeInTheDocument();
      });

      // Toggle show solution on
      fireEvent.click(screen.getByRole('checkbox', { name: /show solution/i }));

      fireEvent.click(screen.getByRole('button', { name: /start session/i }));

      await waitFor(() => {
        expect(sessionsApi.createSession).toHaveBeenCalledWith(section_id, 'problem-1', true);
      });
    });

    it('passes showSolution=false by default when problem is not published', async () => {
      jest.spyOn(problemsApi, 'listProblems').mockResolvedValueOnce(mockProblems);
      jest.spyOn(sectionProblemsApi, 'listProblemSections').mockResolvedValueOnce([]);
      jest.spyOn(sessionsApi, 'createSession').mockResolvedValueOnce({
        id: 'session-123',
        namespace_id: 'ns-1',
        section_id: section_id,
        section_name: section_name,
        problem: null,
        featured_student_id: null,
        featured_code: null,
        creator_id: 'user-1',
        participants: [],
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        last_activity: '2024-01-01T00:00:00Z',
        ended_at: null,
      });

      render(
        <StartSessionModal
          section_id={section_id}
          section_name={section_name}
          onClose={mockOnClose}
          onSessionCreated={mockOnSessionCreated}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('FizzBuzz')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('FizzBuzz'));

      await waitFor(() => {
        expect(screen.getByRole('checkbox', { name: /show solution/i })).toBeInTheDocument();
      });

      // Do NOT toggle — default is false
      fireEvent.click(screen.getByRole('button', { name: /start session/i }));

      await waitFor(() => {
        expect(sessionsApi.createSession).toHaveBeenCalledWith(section_id, 'problem-1', false);
      });
    });
  });
});
