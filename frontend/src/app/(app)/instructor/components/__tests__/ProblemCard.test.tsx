/**
 * Tests for ProblemCard component
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProblemCard from '../ProblemCard';

describe('ProblemCard', () => {
  const mockProblem = {
    id: 'problem-123',
    title: 'Test Problem',
    description: 'This is a test problem description',
    createdAt: '2025-01-01T00:00:00.000Z',
    authorId: 'user-123',
    tags: [],
    classId: 'class-1',
  };

  const defaultProps = {
    problem: mockProblem,
    viewMode: 'list' as const,
    onEdit: jest.fn(),
    onDelete: jest.fn(),
    onCreateSession: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('List View', () => {
    it('renders problem title', () => {
      render(<ProblemCard {...defaultProps} />);
      expect(screen.getByText('Test Problem')).toBeInTheDocument();
    });

    it('renders problem description', () => {
      render(<ProblemCard {...defaultProps} />);
      expect(screen.getByText(/This is a test problem description/)).toBeInTheDocument();
    });

    it('displays created date', () => {
      render(<ProblemCard {...defaultProps} />);
      expect(screen.getByText(/Created Jan 1, 2025/)).toBeInTheDocument();
    });

    it('does not display test case count', () => {
      render(<ProblemCard {...defaultProps} />);
      expect(screen.queryByText(/tests?$/)).not.toBeInTheDocument();
    });

    it('does not display updated date', () => {
      render(<ProblemCard {...defaultProps} />);
      expect(screen.queryByText(/Updated/)).not.toBeInTheDocument();
    });

    it('calls onEdit when Edit button is clicked', () => {
      render(<ProblemCard {...defaultProps} />);
      fireEvent.click(screen.getByText('Edit'));
      expect(defaultProps.onEdit).toHaveBeenCalledWith('problem-123');
    });

    it('calls onCreateSession when Create Session button is clicked', () => {
      render(<ProblemCard {...defaultProps} />);
      fireEvent.click(screen.getByText('Create Session'));
      expect(defaultProps.onCreateSession).toHaveBeenCalledWith('problem-123');
    });

    it('shows confirmation dialog when Delete button is clicked', async () => {
      render(<ProblemCard {...defaultProps} />);
      fireEvent.click(screen.getByText('Delete'));

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText('Delete Problem')).toBeInTheDocument();
        expect(screen.getByText(/Delete "Test Problem"\? This action cannot be undone\./)).toBeInTheDocument();
      });
    });

    it('calls onDelete when Delete button is clicked and confirmed', async () => {
      render(<ProblemCard {...defaultProps} />);
      fireEvent.click(screen.getByText('Delete'));

      // Wait for dialog to appear
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // Click the confirm button in the dialog
      const confirmButton = screen.getByTestId('confirm-dialog-backdrop').parentElement?.querySelector('[data-confirm-button]');
      expect(confirmButton).toBeInTheDocument();
      fireEvent.click(confirmButton!);

      await waitFor(() => {
        expect(defaultProps.onDelete).toHaveBeenCalledWith('problem-123', 'Test Problem');
      });
    });

    it('does not call onDelete when delete is cancelled', async () => {
      render(<ProblemCard {...defaultProps} />);
      fireEvent.click(screen.getByText('Delete'));

      // Wait for dialog to appear
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // Click the cancel button in the dialog
      fireEvent.click(screen.getByText('Cancel'));

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(defaultProps.onDelete).not.toHaveBeenCalled();
      });
    });

    it('shows deleting state while delete is in progress', async () => {
      const slowDelete = jest.fn(() => new Promise(resolve => setTimeout(resolve, 100)));
      render(<ProblemCard {...defaultProps} onDelete={slowDelete} />);

      fireEvent.click(screen.getByText('Delete'));

      // Wait for dialog to appear
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // Click the confirm button
      const confirmButton = screen.getByTestId('confirm-dialog-backdrop').parentElement?.querySelector('[data-confirm-button]');
      fireEvent.click(confirmButton!);

      await waitFor(() => {
        expect(screen.getByText('...')).toBeInTheDocument();
      });
    });
  });

  describe('Grid View', () => {
    const gridProps = { ...defaultProps, viewMode: 'grid' as const };

    it('renders problem title in grid view', () => {
      render(<ProblemCard {...gridProps} />);
      expect(screen.getByText('Test Problem')).toBeInTheDocument();
    });

    it('displays created date in grid view', () => {
      render(<ProblemCard {...gridProps} />);
      expect(screen.getByText(/Jan 1, 2025/)).toBeInTheDocument();
    });

    it('renders all action buttons in grid view', () => {
      render(<ProblemCard {...gridProps} />);
      expect(screen.getByText('Edit')).toBeInTheDocument();
      expect(screen.getByText('Create Session')).toBeInTheDocument();
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    it('handles actions in grid view', () => {
      render(<ProblemCard {...gridProps} />);

      fireEvent.click(screen.getByText('Edit'));
      expect(defaultProps.onEdit).toHaveBeenCalledWith('problem-123');
    });
  });

  describe('Edge Cases', () => {
    it('handles problem without description', () => {
      const problem = { ...mockProblem, description: undefined };
      render(<ProblemCard {...defaultProps} problem={problem} />);
      expect(screen.getByText('Test Problem')).toBeInTheDocument();
      expect(screen.queryByText(/This is a test/)).not.toBeInTheDocument();
    });

    it('handles problem with empty description', () => {
      const problem = { ...mockProblem, description: '   ' };
      render(<ProblemCard {...defaultProps} problem={problem} />);
      expect(screen.queryByText(/^\s+$/)).not.toBeInTheDocument();
    });
  });

  describe('Tag display', () => {
    it('renders tag chips when problem has tags', () => {
      const problem = { ...mockProblem, tags: ['loops', 'arrays'] };
      render(<ProblemCard {...defaultProps} problem={problem} />);
      expect(screen.getByText('loops')).toBeInTheDocument();
      expect(screen.getByText('arrays')).toBeInTheDocument();
    });

    it('does not render tags section when tags array is empty', () => {
      const problem = { ...mockProblem, tags: [] };
      render(<ProblemCard {...defaultProps} problem={problem} />);
      expect(screen.queryByTestId('problem-tags')).not.toBeInTheDocument();
    });

    it('does not render tags section when tags is undefined', () => {
      render(<ProblemCard {...defaultProps} />);
      expect(screen.queryByTestId('problem-tags')).not.toBeInTheDocument();
    });

    it('calls onTagClick when a tag chip is clicked', () => {
      const onTagClick = jest.fn();
      const problem = { ...mockProblem, tags: ['loops'] };
      render(<ProblemCard {...defaultProps} problem={problem} onTagClick={onTagClick} />);
      fireEvent.click(screen.getByText('loops'));
      expect(onTagClick).toHaveBeenCalledWith('loops');
    });

    it('renders tags in grid view', () => {
      const problem = { ...mockProblem, tags: ['loops'] };
      render(<ProblemCard {...defaultProps} problem={problem} viewMode="grid" />);
      expect(screen.getByText('loops')).toBeInTheDocument();
    });
  });

  describe('Copy Link button', () => {
    beforeEach(() => {
      Object.assign(navigator, {
        clipboard: { writeText: jest.fn().mockResolvedValue(undefined) },
      });
    });

    it('renders Copy Link button in list view', () => {
      render(<ProblemCard {...defaultProps} />);
      expect(screen.getByText('Copy Link')).toBeInTheDocument();
    });

    it('renders Copy Link button in grid view', () => {
      render(<ProblemCard {...defaultProps} viewMode="grid" />);
      expect(screen.getByText('Copy Link')).toBeInTheDocument();
    });

    it('copies public URL to clipboard on click', async () => {
      render(<ProblemCard {...defaultProps} />);
      fireEvent.click(screen.getByText('Copy Link'));

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
          expect.stringContaining('/problems/problem-123')
        );
      });
    });

    it('shows Copied! feedback after clicking', async () => {
      render(<ProblemCard {...defaultProps} />);
      fireEvent.click(screen.getByText('Copy Link'));

      await waitFor(() => {
        expect(screen.getByText('Copied!')).toBeInTheDocument();
      });
    });
  });
});
