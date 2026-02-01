/**
 * Unit tests for SectionView component
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import SectionView from '../SectionView';

// Mock fetch
global.fetch = jest.fn();

describe('SectionView', () => {
  const mockOnBack = jest.fn();
  const mockOnCreateSession = jest.fn();
  const mockOnJoinSession = jest.fn();

  const defaultProps = {
    classId: 'class-1',
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
    (global.fetch as jest.Mock).mockImplementation(() => 
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
        name: 'Section A', 
        schedule: 'MWF 10am',
        location: 'Room 101',
        studentCount: 25,
        sessionCount: 5,
        activeSessionCount: 2
      },
      { 
        id: 'section-2', 
        name: 'Section B', 
        schedule: 'TTh 2pm',
        studentCount: 20,
        sessionCount: 3,
        activeSessionCount: 1
      },
    ];

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sections: mockSections }),
    });

    render(<SectionView {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Section A')).toBeInTheDocument();
      expect(screen.getByText('Section B')).toBeInTheDocument();
    });

    expect(screen.getByText('MWF 10am')).toBeInTheDocument();
    expect(screen.getByText('Room 101')).toBeInTheDocument();
    expect(screen.getByText('25 students')).toBeInTheDocument();
    expect(screen.getByText('2 active')).toBeInTheDocument();
  });

  it('should fetch sections from correct API endpoint', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sections: [] }),
    });

    render(<SectionView {...defaultProps} />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/classes/class-1/sections');
    });
  });

  it('should display empty state when no sections', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sections: [] }),
    });

    render(<SectionView {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('No Sections Yet')).toBeInTheDocument();
    });

    expect(screen.getByText(/Create your first section to start organizing sessions/)).toBeInTheDocument();
  });

  it('should display error state on fetch failure', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    render(<SectionView {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Error loading sections')).toBeInTheDocument();
    });
  });

  it('should not render back button in section list view (breadcrumb handles navigation)', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sections: [] }),
    });

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
        name: 'Section A',
        schedule: 'MWF 10am',
        studentCount: 25,
        sessionCount: 5,
        activeSessionCount: 2
      },
    ];

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sections: mockSections }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessions: [] }),
      });

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
    expect(global.fetch).toHaveBeenCalledWith('/api/sections/section-1/sessions');
  });

  it('should display sessions for selected section', async () => {
    const mockSections = [
      { 
        id: 'section-1', 
        name: 'Section A',
        studentCount: 25,
        sessionCount: 2,
        activeSessionCount: 1
      },
    ];

    const mockSessions = [
      {
        id: 'session-1',
        joinCode: 'ABC123',
        problemText: 'Solve fizzbuzz',
        studentCount: 5,
        createdAt: '2025-12-19T10:00:00Z',
        lastActivity: '2025-12-19T10:30:00Z',
        status: 'active' as const,
      },
      {
        id: 'session-2',
        joinCode: 'XYZ789',
        problemText: '',
        studentCount: 3,
        createdAt: '2025-12-19T09:00:00Z',
        lastActivity: '2025-12-19T09:45:00Z',
        status: 'completed' as const,
      },
    ];

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sections: mockSections }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessions: mockSessions }),
      });

    render(<SectionView {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Section A')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Section A/ }));

    await waitFor(() => {
      expect(screen.getByText('ABC123')).toBeInTheDocument();
      expect(screen.getByText('XYZ789')).toBeInTheDocument();
    });

    expect(screen.getByText('Solve fizzbuzz')).toBeInTheDocument();
    expect(screen.getByText('5 students')).toBeInTheDocument();
    expect(screen.getByText('3 students')).toBeInTheDocument();
  });

  it('should call onCreateSession when New Session button is clicked', async () => {
    const mockSections = [
      { 
        id: 'section-1', 
        name: 'Section A',
        studentCount: 25,
        sessionCount: 0,
        activeSessionCount: 0
      },
    ];

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sections: mockSections }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessions: [] }),
      });

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
        name: 'Section A',
        studentCount: 25,
        sessionCount: 1,
        activeSessionCount: 1
      },
    ];

    const mockSessions = [
      {
        id: 'session-1',
        joinCode: 'ABC123',
        problemText: '',
        studentCount: 5,
        createdAt: '2025-12-19T10:00:00Z',
        lastActivity: '2025-12-19T10:30:00Z',
        status: 'active' as const,
      },
    ];

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sections: mockSections }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessions: mockSessions }),
      });

    render(<SectionView {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Section A')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Section A/ }));

    await waitFor(() => {
      expect(screen.getByText('ABC123')).toBeInTheDocument();
    });

    const sessionButton = screen.getByRole('button', { name: /ABC123/ });
    fireEvent.click(sessionButton);

    expect(mockOnJoinSession).toHaveBeenCalledWith('session-1');
    expect(mockOnJoinSession).toHaveBeenCalledTimes(1);
  });

  it('should navigate back to section list when back button clicked in session view', async () => {
    const mockSections = [
      { 
        id: 'section-1', 
        name: 'Section A',
        studentCount: 25,
        sessionCount: 0,
        activeSessionCount: 0
      },
    ];

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sections: mockSections }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessions: [] }),
      });

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
        name: 'Section A',
        studentCount: 25,
        sessionCount: 0,
        activeSessionCount: 0
      },
    ];

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sections: mockSections }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessions: [] }),
      });

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
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sections: [] }),
      });

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
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sections: [] }),
      });

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
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sections: [] }),
      });

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
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ sections: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ section: { id: 'new-section', name: 'Test Section' } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ sections: [{ id: 'new-section', name: 'Test Section', studentCount: 0, sessionCount: 0, activeSessionCount: 0 }] }),
        });

      render(<SectionView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('No Sections Yet')).toBeInTheDocument();
      });

      // Open the modal
      fireEvent.click(screen.getByRole('button', { name: /New Section/ }));

      // Fill out the form
      const nameInput = screen.getByLabelText(/Section Name/);
      fireEvent.change(nameInput, { target: { value: 'Test Section' } });

      const scheduleInput = screen.getByLabelText(/Schedule/);
      fireEvent.change(scheduleInput, { target: { value: 'MWF 10am' } });

      // Submit the form - use the submit button inside the modal form
      const modal = screen.getByText('Create New Section').closest('div[class*="bg-white rounded-xl"]');
      const submitButton = modal!.querySelector('button[type="submit"]') as HTMLButtonElement;
      fireEvent.click(submitButton);

      // Verify API was called with correct data
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/classes/class-1/sections',
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Test Section', schedule: 'MWF 10am', location: '' }),
          })
        );
      });
    });

    it('should close modal and refresh sections after successful creation', async () => {
      const newSection = {
        id: 'new-section',
        name: 'Test Section',
        joinCode: 'ABC123',
        studentCount: 0,
        sessionCount: 0,
        activeSessionCount: 0
      };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ sections: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ section: newSection }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ sections: [newSection] }),
        });

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
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ sections: [] }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ error: 'Section name already exists' }),
        });

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
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sections: [] }),
      });

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
