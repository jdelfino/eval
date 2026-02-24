/**
 * Tests for PublishProblemModal component
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PublishProblemModal from '../PublishProblemModal';

const mockGetClassSections = jest.fn();
const mockListProblemSections = jest.fn();
const mockPublishProblem = jest.fn();
const mockUnpublishProblem = jest.fn();
const mockUpdateSectionProblem = jest.fn();

jest.mock('@/lib/api/sections', () => ({
  getClassSections: (...args: unknown[]) => mockGetClassSections(...args),
}));

jest.mock('@/lib/api/section-problems', () => ({
  listProblemSections: (...args: unknown[]) => mockListProblemSections(...args),
  publishProblem: (...args: unknown[]) => mockPublishProblem(...args),
  unpublishProblem: (...args: unknown[]) => mockUnpublishProblem(...args),
  updateSectionProblem: (...args: unknown[]) => mockUpdateSectionProblem(...args),
}));

const defaultProps = {
  problemId: 'prob-1',
  classId: 'class-1',
  onClose: jest.fn(),
};

const makeSectionInfo = (id: string, name: string) => ({
  id,
  name,
  class_id: 'class-1',
  semester: 'Spring 2024',
  join_code: 'ABC123',
  active: true,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  namespace_id: 'ns-1',
});

const makeSectionProblem = (sectionId: string, showSolution: boolean) => ({
  section_id: sectionId,
  problem_id: 'prob-1',
  show_solution: showSolution,
  published_at: '2025-01-01T00:00:00Z',
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetClassSections.mockReset();
  mockListProblemSections.mockReset();
  mockPublishProblem.mockReset();
  mockUnpublishProblem.mockReset();
  mockUpdateSectionProblem.mockReset();
});

describe('PublishProblemModal', () => {
  it('renders modal title and close button', async () => {
    mockGetClassSections.mockResolvedValue([]);
    mockListProblemSections.mockResolvedValue([]);

    render(<PublishProblemModal {...defaultProps} />);

    expect(screen.getByText('Publish Problem')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    mockGetClassSections.mockResolvedValue([]);
    mockListProblemSections.mockResolvedValue([]);

    render(<PublishProblemModal {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('loads sections for the class on mount', async () => {
    const sections = [
      makeSectionInfo('sec-1', 'Section A'),
      makeSectionInfo('sec-2', 'Section B'),
    ];
    mockGetClassSections.mockResolvedValue(sections);
    mockListProblemSections.mockResolvedValue([]);

    render(<PublishProblemModal {...defaultProps} />);

    await waitFor(() => {
      expect(mockGetClassSections).toHaveBeenCalledWith('class-1');
    });

    await waitFor(() => {
      expect(screen.getByText('Section A')).toBeInTheDocument();
      expect(screen.getByText('Section B')).toBeInTheDocument();
    });
  });

  it('loads current publish state for the problem', async () => {
    mockGetClassSections.mockResolvedValue([makeSectionInfo('sec-1', 'Section A')]);
    mockListProblemSections.mockResolvedValue([
      makeSectionProblem('sec-1', true),
    ]);

    render(<PublishProblemModal {...defaultProps} />);

    await waitFor(() => {
      expect(mockListProblemSections).toHaveBeenCalledWith('prob-1');
    });

    // Section should be checked since it's published
    await waitFor(() => {
      const checkbox = screen.getByRole('checkbox', { name: /Section A Spring 2024/i });
      expect(checkbox).toBeChecked();
    });
  });

  it('shows Show Solution toggle only when section is published', async () => {
    mockGetClassSections.mockResolvedValue([
      makeSectionInfo('sec-1', 'Section A'),
      makeSectionInfo('sec-2', 'Section B'),
    ]);
    mockListProblemSections.mockResolvedValue([
      makeSectionProblem('sec-1', false),
    ]);

    render(<PublishProblemModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Section A')).toBeInTheDocument();
    });

    // Section A should have Show Solution toggle visible
    const solutionToggleA = screen.queryByLabelText(/Show Solution.*Section A/i);
    expect(solutionToggleA).toBeInTheDocument();

    // Section B (not published) should not have Show Solution toggle
    const solutionToggleB = screen.queryByLabelText(/Show Solution.*Section B/i);
    expect(solutionToggleB).not.toBeInTheDocument();
  });

  it('publishes problem to section when checkbox is checked', async () => {
    mockGetClassSections.mockResolvedValue([makeSectionInfo('sec-1', 'Section A')]);
    mockListProblemSections.mockResolvedValue([]);
    mockPublishProblem.mockResolvedValue(undefined);

    render(<PublishProblemModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Section A')).toBeInTheDocument();
    });

    const checkbox = screen.getByRole('checkbox', { name: /Section A Spring 2024/i });
    fireEvent.click(checkbox);

    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockPublishProblem).toHaveBeenCalledWith('sec-1', 'prob-1', false);
    });
  });

  it('unpublishes problem from section when checkbox is unchecked', async () => {
    mockGetClassSections.mockResolvedValue([makeSectionInfo('sec-1', 'Section A')]);
    mockListProblemSections.mockResolvedValue([
      makeSectionProblem('sec-1', false),
    ]);
    mockUnpublishProblem.mockResolvedValue(undefined);

    render(<PublishProblemModal {...defaultProps} />);

    await waitFor(() => {
      const checkbox = screen.getByRole('checkbox', { name: /Section A Spring 2024/i });
      expect(checkbox).toBeChecked();
    });

    const checkbox = screen.getByRole('checkbox', { name: /Section A Spring 2024/i });
    fireEvent.click(checkbox);

    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockUnpublishProblem).toHaveBeenCalledWith('sec-1', 'prob-1');
    });
  });

  it('updates show_solution setting when toggle is changed', async () => {
    mockGetClassSections.mockResolvedValue([makeSectionInfo('sec-1', 'Section A')]);
    mockListProblemSections.mockResolvedValue([
      makeSectionProblem('sec-1', false),
    ]);
    mockUpdateSectionProblem.mockResolvedValue(undefined);

    render(<PublishProblemModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Section A')).toBeInTheDocument();
    });

    const solutionToggle = screen.getByRole('checkbox', { name: /Show Solution/i });
    fireEvent.click(solutionToggle);

    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateSectionProblem).toHaveBeenCalledWith('sec-1', 'prob-1', {
        show_solution: true,
      });
    });
  });

  it('handles multiple operations in one save (publish + update)', async () => {
    mockGetClassSections.mockResolvedValue([
      makeSectionInfo('sec-1', 'Section A'),
      makeSectionInfo('sec-2', 'Section B'),
    ]);
    mockListProblemSections.mockResolvedValue([
      makeSectionProblem('sec-1', false),
    ]);
    mockPublishProblem.mockResolvedValue(undefined);
    mockUpdateSectionProblem.mockResolvedValue(undefined);

    render(<PublishProblemModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Section A')).toBeInTheDocument();
    });

    // Update Section A's show_solution
    const solutionToggleA = screen.getByRole('checkbox', { name: /Show Solution for Section A/i });
    fireEvent.click(solutionToggleA);

    // Publish to Section B
    const checkboxB = screen.getByRole('checkbox', { name: /Section B Spring 2024/i });
    fireEvent.click(checkboxB);

    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateSectionProblem).toHaveBeenCalledWith('sec-1', 'prob-1', {
        show_solution: true,
      });
      expect(mockPublishProblem).toHaveBeenCalledWith('sec-2', 'prob-1', false);
    });
  });

  it('closes modal after successful save', async () => {
    mockGetClassSections.mockResolvedValue([makeSectionInfo('sec-1', 'Section A')]);
    mockListProblemSections.mockResolvedValue([]);
    mockPublishProblem.mockResolvedValue(undefined);

    render(<PublishProblemModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Section A')).toBeInTheDocument();
    });

    const checkbox = screen.getByRole('checkbox', { name: /Section A Spring 2024/i });
    fireEvent.click(checkbox);

    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(defaultProps.onClose).toHaveBeenCalled();
    });
  });

  it('displays error when API call fails', async () => {
    mockGetClassSections.mockResolvedValue([makeSectionInfo('sec-1', 'Section A')]);
    mockListProblemSections.mockResolvedValue([]);
    mockPublishProblem.mockRejectedValue(new Error('Server error'));

    render(<PublishProblemModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Section A')).toBeInTheDocument();
    });

    const checkbox = screen.getByRole('checkbox', { name: /Section A Spring 2024/i });
    fireEvent.click(checkbox);

    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });
  });

  it('disables buttons while saving', async () => {
    mockGetClassSections.mockResolvedValue([makeSectionInfo('sec-1', 'Section A')]);
    mockListProblemSections.mockResolvedValue([]);
    mockPublishProblem.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));

    render(<PublishProblemModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Section A')).toBeInTheDocument();
    });

    const checkbox = screen.getByRole('checkbox', { name: /Section A Spring 2024/i });
    fireEvent.click(checkbox);

    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(saveButton).toBeDisabled();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
    });
  });

  it('shows loading state when fetching data', async () => {
    mockGetClassSections.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve([]), 100)));
    mockListProblemSections.mockResolvedValue([]);

    render(<PublishProblemModal {...defaultProps} />);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('displays message when no sections exist for the class', async () => {
    mockGetClassSections.mockResolvedValue([]);
    mockListProblemSections.mockResolvedValue([]);

    render(<PublishProblemModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/no sections/i)).toBeInTheDocument();
    });
  });
});
