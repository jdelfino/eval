/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StartSessionModal from '../StartSessionModal';

// Mock next/navigation
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe('StartSessionModal', () => {
  const mockOnClose = jest.fn();
  const mockOnSessionCreated = jest.fn();
  const sectionId = 'section-123';
  const sectionName = 'Section A';

  const mockProblems = [
    { id: 'problem-1', title: 'FizzBuzz', authorName: 'Instructor' },
    { id: 'problem-2', title: 'Two Sum', authorName: 'Instructor' },
    { id: 'problem-3', title: 'Binary Search', authorName: 'Instructor' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('renders the modal with title and section name', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ problems: mockProblems }),
      });

      render(
        <StartSessionModal
          sectionId={sectionId}
          sectionName={sectionName}
          onClose={mockOnClose}
          onSessionCreated={mockOnSessionCreated}
        />
      );

      expect(screen.getByRole('heading', { name: 'Start Session' })).toBeInTheDocument();
      expect(screen.getByText(sectionName)).toBeInTheDocument();
    });

    it('shows loading state while fetching problems', () => {
      (global.fetch as jest.Mock).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      render(
        <StartSessionModal
          sectionId={sectionId}
          sectionName={sectionName}
          onClose={mockOnClose}
          onSessionCreated={mockOnSessionCreated}
        />
      );

      expect(screen.getByText(/loading problems/i)).toBeInTheDocument();
    });

    it('displays problem list after loading', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ problems: mockProblems }),
      });

      render(
        <StartSessionModal
          sectionId={sectionId}
          sectionName={sectionName}
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
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ problems: mockProblems }),
      });

      render(
        <StartSessionModal
          sectionId={sectionId}
          sectionName={sectionName}
          onClose={mockOnClose}
          onSessionCreated={mockOnSessionCreated}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/create blank session/i)).toBeInTheDocument();
      });
    });

    it('shows Cancel and Start Session buttons', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ problems: mockProblems }),
      });

      render(
        <StartSessionModal
          sectionId={sectionId}
          sectionName={sectionName}
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
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ problems: mockProblems }),
      });

      render(
        <StartSessionModal
          sectionId={sectionId}
          sectionName={sectionName}
          onClose={mockOnClose}
          onSessionCreated={mockOnSessionCreated}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('closes modal when clicking outside the modal content', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ problems: mockProblems }),
      });

      render(
        <StartSessionModal
          sectionId={sectionId}
          sectionName={sectionName}
          onClose={mockOnClose}
          onSessionCreated={mockOnSessionCreated}
        />
      );

      const backdrop = screen.getByTestId('modal-backdrop');
      fireEvent.click(backdrop);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('does not close modal when clicking inside the modal content', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ problems: mockProblems }),
      });

      render(
        <StartSessionModal
          sectionId={sectionId}
          sectionName={sectionName}
          onClose={mockOnClose}
          onSessionCreated={mockOnSessionCreated}
        />
      );

      const modalContent = screen.getByTestId('modal-content');
      fireEvent.click(modalContent);

      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('closes modal when X button is clicked', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ problems: mockProblems }),
      });

      render(
        <StartSessionModal
          sectionId={sectionId}
          sectionName={sectionName}
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
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ problems: mockProblems }),
      });

      render(
        <StartSessionModal
          sectionId={sectionId}
          sectionName={sectionName}
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
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ problems: mockProblems }),
      });

      render(
        <StartSessionModal
          sectionId={sectionId}
          sectionName={sectionName}
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
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ problems: mockProblems }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            session: { id: 'session-123', joinCode: 'ABC123' },
          }),
        });

      render(
        <StartSessionModal
          sectionId={sectionId}
          sectionName={sectionName}
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
        expect(global.fetch).toHaveBeenCalledWith('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sectionId: sectionId,
            problemId: 'problem-1',
          }),
        });
      });

      expect(mockOnSessionCreated).toHaveBeenCalledWith('session-123');
      expect(mockPush).toHaveBeenCalledWith('/instructor/session/session-123');
    });

    it('creates blank session when no problem selected', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ problems: mockProblems }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            session: { id: 'session-456', joinCode: 'XYZ789' },
          }),
        });

      render(
        <StartSessionModal
          sectionId={sectionId}
          sectionName={sectionName}
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
        expect(global.fetch).toHaveBeenCalledWith('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sectionId: sectionId,
          }),
        });
      });

      expect(mockOnSessionCreated).toHaveBeenCalledWith('session-456');
      expect(mockPush).toHaveBeenCalledWith('/instructor/session/session-456');
    });

    it('shows loading state while creating session', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ problems: mockProblems }),
        })
        .mockImplementationOnce(
          () =>
            new Promise((resolve) =>
              setTimeout(
                () =>
                  resolve({
                    ok: true,
                    json: async () => ({
                      session: { id: 'session-123', joinCode: 'ABC123' },
                    }),
                  }),
                100
              )
            )
        );

      render(
        <StartSessionModal
          sectionId={sectionId}
          sectionName={sectionName}
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
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ problems: mockProblems }),
        })
        .mockImplementationOnce(
          () =>
            new Promise((resolve) =>
              setTimeout(
                () =>
                  resolve({
                    ok: true,
                    json: async () => ({
                      session: { id: 'session-123', joinCode: 'ABC123' },
                    }),
                  }),
                100
              )
            )
        );

      render(
        <StartSessionModal
          sectionId={sectionId}
          sectionName={sectionName}
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
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ problems: mockProblems }),
        })
        .mockImplementationOnce(
          () =>
            new Promise((resolve) =>
              setTimeout(
                () =>
                  resolve({
                    ok: true,
                    json: async () => ({
                      session: { id: 'session-123', joinCode: 'ABC123' },
                    }),
                  }),
                100
              )
            )
        );

      render(
        <StartSessionModal
          sectionId={sectionId}
          sectionName={sectionName}
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
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Failed to load problems' }),
      });

      render(
        <StartSessionModal
          sectionId={sectionId}
          sectionName={sectionName}
          onClose={mockOnClose}
          onSessionCreated={mockOnSessionCreated}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/failed to load problems/i)).toBeInTheDocument();
      });
    });

    it('shows error when session creation fails', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ problems: mockProblems }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ error: 'Failed to create session' }),
        });

      render(
        <StartSessionModal
          sectionId={sectionId}
          sectionName={sectionName}
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
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ problems: mockProblems }),
        })
        .mockRejectedValueOnce(new Error('Network error'));

      render(
        <StartSessionModal
          sectionId={sectionId}
          sectionName={sectionName}
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
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ problems: mockProblems }),
      });

      render(
        <StartSessionModal
          sectionId={sectionId}
          sectionName={sectionName}
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
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ problems: [] }),
      });

      render(
        <StartSessionModal
          sectionId={sectionId}
          sectionName={sectionName}
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
});
