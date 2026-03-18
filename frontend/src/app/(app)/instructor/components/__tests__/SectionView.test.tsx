/**
 * Unit tests for SectionView component
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import SectionView from '../SectionView';

// Mock API functions
const mockGetClassSections = jest.fn();
const mockDeleteSection = jest.fn();
const mockGetActiveSessions = jest.fn();
const mockCreateSection = jest.fn();

jest.mock('@/lib/api/sections', () => ({
  getClassSections: (...args: unknown[]) => mockGetClassSections(...args),
  deleteSection: (...args: unknown[]) => mockDeleteSection(...args),
  getActiveSessions: (...args: unknown[]) => mockGetActiveSessions(...args),
}));

jest.mock('@/lib/api/classes', () => ({
  createSection: (...args: unknown[]) => mockCreateSection(...args),
}));

describe('SectionView', () => {
  const mockOnBack = jest.fn();
  const mockOnCreateSession = jest.fn();
  const mockOnJoinSession = jest.fn();

  const defaultProps = {
    class_id: 'class-1',
    className: 'CS101 Fall 2025',
    onBack: mockOnBack,
    onCreateSession: mockOnCreateSession,
    onJoinSession: mockOnJoinSession,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should render loading state initially', () => {
    mockGetClassSections.mockImplementation(() =>
      new Promise(() => {}) // Never resolves
    );

    render(<SectionView {...defaultProps} />);

    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('should fetch and display sections for a class', async () => {
    const mockSections = [
      {
        id: 'section-1',
        namespace_id: 'ns-1',
        class_id: 'class-1',
        name: 'Section A',
        semester: null,
        join_code: 'ABC123',
        active: true,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      },
      {
        id: 'section-2',
        namespace_id: 'ns-1',
        class_id: 'class-1',
        name: 'Section B',
        semester: null,
        join_code: 'XYZ789',
        active: true,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      },
    ];

    mockGetClassSections.mockResolvedValueOnce(mockSections);

    render(<SectionView {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Section A')).toBeInTheDocument();
      expect(screen.getByText('Section B')).toBeInTheDocument();
    });

    // Component displays section join codes
    expect(screen.getByText('ABC-123')).toBeInTheDocument();
    expect(screen.getByText('XYZ-789')).toBeInTheDocument();
  });

  it('should fetch sections from correct API endpoint', async () => {
    mockGetClassSections.mockResolvedValueOnce([]);

    render(<SectionView {...defaultProps} />);

    await waitFor(() => {
      expect(mockGetClassSections).toHaveBeenCalledWith('class-1');
    });
  });

  it('should display empty state when no sections', async () => {
    mockGetClassSections.mockResolvedValueOnce([]);

    render(<SectionView {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('No Sections Yet')).toBeInTheDocument();
    });

    expect(screen.getByText(/Create your first section to start organizing sessions/)).toBeInTheDocument();
  });

  it('should display error state on fetch failure', async () => {
    mockGetClassSections.mockRejectedValueOnce(new Error('Failed to fetch'));

    render(<SectionView {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Error loading sections')).toBeInTheDocument();
    });
  });

  it('should not render back button in section list view (breadcrumb handles navigation)', async () => {
    mockGetClassSections.mockResolvedValueOnce([]);

    render(<SectionView {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('CS101 Fall 2025')).toBeInTheDocument();
    });

    // Back button should not be present - navigation is handled by breadcrumbs
    const backButton = screen.queryByRole('button', { name: /Back to Classes/ });
    expect(backButton).not.toBeInTheDocument();
  });

  it('should navigate to section detail when section is clicked', async () => {
    const mockSections = [
      {
        id: 'section-1',
        namespace_id: 'ns-1',
        class_id: 'class-1',
        name: 'Section A',
        semester: null,
        join_code: 'ABC123',
        active: true,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      },
    ];

    mockGetClassSections.mockResolvedValueOnce(mockSections);
    mockGetActiveSessions.mockResolvedValueOnce([]);

    render(<SectionView {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Section A')).toBeInTheDocument();
    });

    const sectionButton = screen.getByRole('button', { name: /Section A/ });
    fireEvent.click(sectionButton);

    await waitFor(() => {
      expect(screen.getByText('Sessions')).toBeInTheDocument();
    });

    // Should fetch sessions for the selected section
    expect(mockGetActiveSessions).toHaveBeenCalledWith('section-1');
  });

  it('should display sessions for selected section', async () => {
    const mockSections = [
      {
        id: 'section-1',
        namespace_id: 'ns-1',
        class_id: 'class-1',
        name: 'Section A',
        semester: null,
        join_code: 'ABC123',
        active: true,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      },
    ];

    const mockSessions = [
      {
        id: 'session-1',
        namespace_id: 'ns-1',
        section_id: 'section-1',
        section_name: 'Section A',
        problem: { title: 'Solve fizzbuzz' },
        featured_student_id: null,
        featured_code: null,
        creator_id: 'user-1',
        participants: ['p1', 'p2', 'p3', 'p4', 'p5'],
        status: 'active' as const,
        created_at: '2025-12-19T10:00:00Z',
        last_activity: '2025-12-19T10:30:00Z',
        ended_at: null,
      },
      {
        id: 'session-2',
        namespace_id: 'ns-1',
        section_id: 'section-1',
        section_name: 'Section A',
        problem: null,
        featured_student_id: null,
        featured_code: null,
        creator_id: 'user-1',
        participants: ['p1', 'p2', 'p3'],
        status: 'completed' as const,
        created_at: '2025-12-19T09:00:00Z',
        last_activity: '2025-12-19T09:45:00Z',
        ended_at: '2025-12-19T10:00:00Z',
      },
    ];

    mockGetClassSections.mockResolvedValueOnce(mockSections);
    mockGetActiveSessions.mockResolvedValueOnce(mockSessions);

    render(<SectionView {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Section A')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Section A/ }));

    // Verify sessions are displayed - component shows participant count and status
    await waitFor(() => {
      expect(screen.getByText('5 students')).toBeInTheDocument();
      expect(screen.getByText('3 students')).toBeInTheDocument();
    });

    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText('completed')).toBeInTheDocument();
  });

  it('should call onCreateSession when New Session button is clicked', async () => {
    const mockSections = [
      {
        id: 'section-1',
        namespace_id: 'ns-1',
        class_id: 'class-1',
        name: 'Section A',
        semester: null,
        join_code: 'ABC123',
        active: true,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      },
    ];

    mockGetClassSections.mockResolvedValueOnce(mockSections);
    mockGetActiveSessions.mockResolvedValueOnce([]);

    render(<SectionView {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Section A')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Section A/ }));

    await waitFor(() => {
      expect(screen.getByText('Sessions')).toBeInTheDocument();
    });

    const createButton = screen.getByRole('button', { name: /New Session/ });
    fireEvent.click(createButton);

    expect(mockOnCreateSession).toHaveBeenCalledWith('section-1', 'Section A');
    expect(mockOnCreateSession).toHaveBeenCalledTimes(1);
  });

  it('should call onJoinSession when session is clicked', async () => {
    const mockSections = [
      {
        id: 'section-1',
        namespace_id: 'ns-1',
        class_id: 'class-1',
        name: 'Section A',
        semester: null,
        join_code: 'ABC123',
        active: true,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      },
    ];

    const mockSessions = [
      {
        id: 'session-1',
        namespace_id: 'ns-1',
        section_id: 'section-1',
        section_name: 'Section A',
        problem: null,
        featured_student_id: null,
        featured_code: null,
        creator_id: 'user-1',
        participants: ['p1', 'p2', 'p3', 'p4', 'p5'],
        status: 'active' as const,
        created_at: '2025-12-19T10:00:00Z',
        last_activity: '2025-12-19T10:30:00Z',
        ended_at: null,
      },
    ];

    mockGetClassSections.mockResolvedValueOnce(mockSections);
    mockGetActiveSessions.mockResolvedValueOnce(mockSessions);

    render(<SectionView {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Section A')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Section A/ }));

    await waitFor(() => {
      expect(screen.getByText('5 students')).toBeInTheDocument();
    });

    // Click on the session button (contains "5 students" and "active")
    const sessionButton = screen.getByRole('button', { name: /5 students/ });
    fireEvent.click(sessionButton);

    expect(mockOnJoinSession).toHaveBeenCalledWith('session-1');
    expect(mockOnJoinSession).toHaveBeenCalledTimes(1);
  });

  it('should navigate back to section list when back button clicked in session view', async () => {
    const mockSections = [
      {
        id: 'section-1',
        namespace_id: 'ns-1',
        class_id: 'class-1',
        name: 'Section A',
        semester: null,
        join_code: 'ABC123',
        active: true,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      },
    ];

    mockGetClassSections.mockResolvedValueOnce(mockSections);
    mockGetActiveSessions.mockResolvedValueOnce([]);

    render(<SectionView {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Section A')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Section A/ }));

    await waitFor(() => {
      expect(screen.getByText('Sessions')).toBeInTheDocument();
    });

    const backButton = screen.getByRole('button', { name: /Back to CS101 Fall 2025/ });
    fireEvent.click(backButton);

    await waitFor(() => {
      expect(screen.getByText('Select a section to view and manage sessions')).toBeInTheDocument();
    });
  });

  it('should display empty session state with create button', async () => {
    const mockSections = [
      {
        id: 'section-1',
        namespace_id: 'ns-1',
        class_id: 'class-1',
        name: 'Section A',
        semester: null,
        join_code: 'ABC123',
        active: true,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      },
    ];

    mockGetClassSections.mockResolvedValueOnce(mockSections);
    mockGetActiveSessions.mockResolvedValueOnce([]);

    render(<SectionView {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Section A')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Section A/ }));

    await waitFor(() => {
      expect(screen.getByText('No sessions yet')).toBeInTheDocument();
    });

    expect(screen.getByText('Create a new session to start teaching')).toBeInTheDocument();

    const createButton = screen.getByRole('button', { name: /Create First Session/ });
    fireEvent.click(createButton);

    expect(mockOnCreateSession).toHaveBeenCalledWith('section-1', 'Section A');
  });

  describe('CreateSectionModal integration', () => {
    it('should open modal when New Section button is clicked', async () => {
      mockGetClassSections.mockResolvedValueOnce([]);

      render(<SectionView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('No Sections Yet')).toBeInTheDocument();
      });

      // Click the "New Section" button in the header
      const newSectionButton = screen.getByRole('button', { name: /New Section/ });
      fireEvent.click(newSectionButton);

      // Verify modal appears
      expect(screen.getByText('Create New Section')).toBeInTheDocument();
      expect(screen.getByLabelText(/Section Name/)).toBeInTheDocument();
    });

    it('should open modal when Create Section button in empty state is clicked', async () => {
      mockGetClassSections.mockResolvedValueOnce([]);

      render(<SectionView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('No Sections Yet')).toBeInTheDocument();
      });

      // Click the "Create Section" button in the empty state
      const createSectionButton = screen.getByRole('button', { name: /Create Section/ });
      fireEvent.click(createSectionButton);

      // Verify modal appears
      expect(screen.getByText('Create New Section')).toBeInTheDocument();
    });

    it('should close modal when Cancel button is clicked', async () => {
      mockGetClassSections.mockResolvedValueOnce([]);

      render(<SectionView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('No Sections Yet')).toBeInTheDocument();
      });

      // Open the modal
      fireEvent.click(screen.getByRole('button', { name: /New Section/ }));
      expect(screen.getByText('Create New Section')).toBeInTheDocument();

      // Click Cancel
      const cancelButton = screen.getByRole('button', { name: /Cancel/ });
      fireEvent.click(cancelButton);

      // Verify modal is closed
      await waitFor(() => {
        expect(screen.queryByText('Create New Section')).not.toBeInTheDocument();
      });
    });

    it('should submit form and call API when Create Section is clicked', async () => {
      const newSection = { id: 'new-section', name: 'Test Section', join_code: 'ABC', active: true, namespace_id: 'ns-1', class_id: 'class-1', semester: null, created_at: '2025-01-01', updated_at: '2025-01-01' };
      mockGetClassSections
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([newSection]);
      mockCreateSection.mockResolvedValueOnce(newSection);

      render(<SectionView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('No Sections Yet')).toBeInTheDocument();
      });

      // Open the modal
      fireEvent.click(screen.getByRole('button', { name: /New Section/ }));

      // Fill out the form
      const nameInput = screen.getByLabelText(/Section Name/);
      fireEvent.change(nameInput, { target: { value: 'Test Section' } });

      // Submit the form - use the submit button inside the modal form
      const modal = screen.getByText('Create New Section').closest('div[class*="bg-white rounded-xl"]');
      const submitButton = modal!.querySelector('button[type="submit"]') as HTMLButtonElement;
      fireEvent.click(submitButton);

      // Verify createSection API was called
      await waitFor(() => {
        expect(mockCreateSection).toHaveBeenCalledWith('class-1', expect.objectContaining({ name: 'Test Section' }));
      });
    });

    it('should close modal and refresh sections after successful creation', async () => {
      const newSection = {
        id: 'new-section',
        name: 'Test Section',
        join_code: 'ABC123',
        active: true,
        namespace_id: 'ns-1',
        class_id: 'class-1',
        semester: null,
        created_at: '2025-01-01',
        updated_at: '2025-01-01',
      };

      mockGetClassSections
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([newSection]);
      mockCreateSection.mockResolvedValueOnce(newSection);

      render(<SectionView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('No Sections Yet')).toBeInTheDocument();
      });

      // Open the modal
      fireEvent.click(screen.getByRole('button', { name: /New Section/ }));

      // Fill and submit using the modal's submit button
      fireEvent.change(screen.getByLabelText(/Section Name/), { target: { value: 'Test Section' } });
      const modal = screen.getByText('Create New Section').closest('div[class*="bg-white rounded-xl"]');
      const submitButton = modal!.querySelector('button[type="submit"]') as HTMLButtonElement;
      fireEvent.click(submitButton);

      // Verify modal closes and new section appears
      await waitFor(() => {
        expect(screen.queryByText('Create New Section')).not.toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByText('Test Section')).toBeInTheDocument();
      });
    });

    it('should display error when API call fails', async () => {
      mockGetClassSections.mockResolvedValueOnce([]);
      mockCreateSection.mockRejectedValueOnce(new Error('Section name already exists'));

      render(<SectionView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('No Sections Yet')).toBeInTheDocument();
      });

      // Open the modal
      fireEvent.click(screen.getByRole('button', { name: /New Section/ }));

      // Fill and submit using the modal's submit button
      fireEvent.change(screen.getByLabelText(/Section Name/), { target: { value: 'Duplicate Section' } });
      const modal = screen.getByText('Create New Section').closest('div[class*="bg-white rounded-xl"]');
      const submitButton = modal!.querySelector('button[type="submit"]') as HTMLButtonElement;
      fireEvent.click(submitButton);

      // Verify error is displayed
      await waitFor(() => {
        expect(screen.getByText('Section name already exists')).toBeInTheDocument();
      });

      // Modal should still be open
      expect(screen.getByText('Create New Section')).toBeInTheDocument();
    });

    it('should not allow submission with empty section name', async () => {
      mockGetClassSections.mockResolvedValueOnce([]);

      render(<SectionView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('No Sections Yet')).toBeInTheDocument();
      });

      // Open the modal
      fireEvent.click(screen.getByRole('button', { name: /New Section/ }));

      // Get the submit button inside the modal - it should be disabled
      const modal = screen.getByText('Create New Section').closest('div[class*="bg-white rounded-xl"]');
      const submitButton = modal!.querySelector('button[type="submit"]') as HTMLButtonElement;
      expect(submitButton).toBeDisabled();
    });
  });
});
