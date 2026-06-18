/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CreateSessionFromProblemModal from '../CreateSessionFromProblemModal';
import * as sectionsApi from '@/lib/api/sections';
import * as sessionsApi from '@/lib/api/sessions';
import * as sectionProblemsApi from '@/lib/api/section-problems';
import * as instructorApi from '@/lib/api/instructor';

jest.mock('@/lib/api/sections');
jest.mock('@/lib/api/sessions');
jest.mock('@/lib/api/section-problems');
jest.mock('@/lib/api/instructor');

const startButton = () => screen.getByRole('button', { name: /start session/i });
const selectSection = (label: string) => fireEvent.click(screen.getByText(label));

describe('CreateSessionFromProblemModal', () => {
  const defaultProps = {
    problem_id: 'prob-1',
    problem_title: 'Two Sum',
    class_id: 'class-1',
    className: 'CS 101',
    onClose: jest.fn(),
    onSuccess: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    // Default: no published sections
    (sectionProblemsApi.listProblemSections as jest.Mock).mockResolvedValue([]);
    // Default: empty dashboard (no student counts surfaced)
    (instructorApi.getInstructorDashboard as jest.Mock).mockResolvedValue({ classes: [] });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('displays the class name as read-only text', async () => {
    (sectionsApi.getClassSections as jest.Mock).mockResolvedValueOnce([]);

    render(<CreateSessionFromProblemModal {...defaultProps} />);

    expect(screen.getByText('CS 101')).toBeInTheDocument();
    // No class picker
    expect(screen.queryByText('-- Select a class --')).not.toBeInTheDocument();
  });

  it('renders through the Modal shell with backdrop/content testids and the v4 title', async () => {
    (sectionsApi.getClassSections as jest.Mock).mockResolvedValueOnce([]);

    render(<CreateSessionFromProblemModal {...defaultProps} />);

    expect(screen.getByTestId('modal-backdrop')).toBeInTheDocument();
    expect(screen.getByTestId('modal-content')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Start a session' })).toBeInTheDocument();
    // SessionComposer body present.
    expect(screen.getByRole('button', { name: /start session/i })).toBeInTheDocument();
  });

  it('Escape invokes the close handler once', async () => {
    (sectionsApi.getClassSections as jest.Mock).mockResolvedValueOnce([]);

    render(<CreateSessionFromProblemModal {...defaultProps} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('loads sections for the given class_id on mount', async () => {
    const mockSections = [
      { id: 'sec-1', name: 'Section A', join_code: 'ABC' },
      { id: 'sec-2', name: 'Section B', join_code: 'DEF' },
    ];
    (sectionsApi.getClassSections as jest.Mock).mockResolvedValueOnce(mockSections);

    render(<CreateSessionFromProblemModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Section A')).toBeInTheDocument();
      expect(screen.getByText('Section B')).toBeInTheDocument();
    });

    expect(sectionsApi.getClassSections).toHaveBeenCalledWith('class-1');
  });

  it('creates a session when a section is selected and submitted', async () => {
    const mockSections = [{ id: 'sec-1', name: 'Section A', join_code: 'ABC' }];
    const mockSession = { id: 'session-1', join_code: 'JOIN123' };

    (sectionsApi.getClassSections as jest.Mock).mockResolvedValueOnce(mockSections);
    (sessionsApi.createSession as jest.Mock).mockResolvedValueOnce(mockSession);

    render(<CreateSessionFromProblemModal {...defaultProps} />);

    await waitFor(() => expect(screen.getByText('Section A')).toBeInTheDocument());

    selectSection('Section A');
    // Wait for the publish lookup to resolve so showSolutionArg is defined (false).
    await waitFor(() => expect(screen.getByText(/publish to section/i)).toBeInTheDocument());
    fireEvent.click(startButton());

    await waitFor(() => {
      expect(defaultProps.onSuccess).toHaveBeenCalledWith('session-1', 'ABC');
    });

    // showSolution=false (default, not published) and set_current via default-checked box.
    expect(sessionsApi.createSession).toHaveBeenCalledWith('sec-1', 'prob-1', false, {
      setCurrent: true,
    });
  });

  it('only fetches sections, not classes', async () => {
    const mockSections = [{ id: 'sec-1', name: 'Section A', join_code: 'ABC' }];
    (sectionsApi.getClassSections as jest.Mock).mockResolvedValueOnce(mockSections);

    render(<CreateSessionFromProblemModal {...defaultProps} />);

    await waitFor(() => expect(screen.getByText('Section A')).toBeInTheDocument());

    expect(sectionsApi.getClassSections).toHaveBeenCalledTimes(1);
    expect(sectionsApi.getClassSections).toHaveBeenCalledWith('class-1');
  });

  it('pre-selects last-used section when class_id matches', async () => {
    localStorage.setItem('lastUsedSection', JSON.stringify({ section_id: 'sec-2', class_id: 'class-1' }));

    const mockSections = [
      { id: 'sec-1', name: 'Section A', join_code: 'ABC' },
      { id: 'sec-2', name: 'Section B', join_code: 'DEF' },
    ];
    (sectionsApi.getClassSections as jest.Mock).mockResolvedValueOnce(mockSections);

    render(<CreateSessionFromProblemModal {...defaultProps} />);

    await waitFor(() => {
      const rows = screen.getAllByRole('radio');
      // Section B (sec-2) preselected.
      const secB = screen.getByText('Section B').closest('[role="radio"]');
      expect(secB).toHaveAttribute('aria-checked', 'true');
      expect(rows.find(r => r === screen.getByText('Section A').closest('[role="radio"]')))
        .toHaveAttribute('aria-checked', 'false');
    });
  });

  it('does not pre-select when last-used section is for a different class', async () => {
    localStorage.setItem('lastUsedSection', JSON.stringify({ section_id: 'sec-1', class_id: 'other-class' }));

    const mockSections = [
      { id: 'sec-1', name: 'Section A', join_code: 'ABC' },
      { id: 'sec-2', name: 'Section B', join_code: 'DEF' },
    ];
    (sectionsApi.getClassSections as jest.Mock).mockResolvedValueOnce(mockSections);

    render(<CreateSessionFromProblemModal {...defaultProps} />);

    await waitFor(() => expect(screen.getByText('Section A')).toBeInTheDocument());

    expect(screen.getByText('Section A').closest('[role="radio"]')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Section B').closest('[role="radio"]')).toHaveAttribute('aria-checked', 'false');
  });

  it('saves last-used section on successful session creation', async () => {
    const mockSections = [{ id: 'sec-1', name: 'Section A', join_code: 'ABC' }];
    const mockSession = { id: 'session-1', join_code: 'JOIN123' };

    (sectionsApi.getClassSections as jest.Mock).mockResolvedValueOnce(mockSections);
    (sessionsApi.createSession as jest.Mock).mockResolvedValueOnce(mockSession);

    render(<CreateSessionFromProblemModal {...defaultProps} />);

    await waitFor(() => expect(screen.getByText('Section A')).toBeInTheDocument());

    selectSection('Section A');
    fireEvent.click(startButton());

    await waitFor(() => expect(defaultProps.onSuccess).toHaveBeenCalled());

    const stored = JSON.parse(localStorage.getItem('lastUsedSection')!);
    expect(stored).toEqual({ section_id: 'sec-1', class_id: 'class-1' });
  });

  it('renders a live pill for a section with a current session pointer', async () => {
    const mockSections = [
      { id: 'sec-1', name: 'Section A', join_code: 'ABC', current_session_id: 'sess-9' },
      { id: 'sec-2', name: 'Section B', join_code: 'DEF', current_session_id: null },
    ];
    (sectionsApi.getClassSections as jest.Mock).mockResolvedValueOnce(mockSections);

    render(<CreateSessionFromProblemModal {...defaultProps} />);

    await waitFor(() => expect(screen.getByText('Section A')).toBeInTheDocument());
    // Exactly one live pill — for the pointed-at section.
    expect(screen.getAllByText('now')).toHaveLength(1);
  });

  it('shows student counts from the dashboard, degraded line for co-instructor (non-creator) sections', async () => {
    // sec-1 is a co-instructor section: present from getClassSections but absent in the
    // dashboard (which only surfaces the instructor's own classes). It should still render
    // with a live pill and a degraded (no-count) status line.
    const mockSections = [
      { id: 'sec-1', name: 'Co-Taught Section', join_code: 'ABC', current_session_id: 'sess-live' },
      { id: 'sec-2', name: 'Own Section', join_code: 'DEF', current_session_id: null },
    ];
    (sectionsApi.getClassSections as jest.Mock).mockResolvedValueOnce(mockSections);
    (instructorApi.getInstructorDashboard as jest.Mock).mockResolvedValueOnce({
      classes: [
        { id: 'class-1', name: 'CS 101', sections: [{ id: 'sec-2', name: 'Own Section', join_code: 'DEF', studentCount: 30 }] },
      ],
    });

    render(<CreateSessionFromProblemModal {...defaultProps} />);

    await waitFor(() => expect(screen.getByText('Co-Taught Section')).toBeInTheDocument());

    // Own section gets a count from the dashboard.
    await waitFor(() => expect(screen.getByText('30 students')).toBeInTheDocument());
    // Co-taught section renders with NO count line (degraded).
    expect(screen.getByText('Co-Taught Section').closest('[role="radio"]')).not.toHaveTextContent(/students/);
    // Live pill is driven by current_session_id, not the dashboard.
    expect(screen.getAllByText('now')).toHaveLength(1);
  });

  describe('publish UX', () => {
    it('shows publish info box when section is not yet published', async () => {
      const mockSections = [{ id: 'sec-1', name: 'Section A', join_code: 'ABC' }];
      (sectionsApi.getClassSections as jest.Mock).mockResolvedValueOnce(mockSections);
      (sectionProblemsApi.listProblemSections as jest.Mock).mockResolvedValueOnce([]);

      render(<CreateSessionFromProblemModal {...defaultProps} />);

      await waitFor(() => expect(screen.getByText('Section A')).toBeInTheDocument());

      selectSection('Section A');

      await waitFor(() => expect(screen.getByText(/publish to section/i)).toBeInTheDocument());
    });

    it('shows "Already published" note when problem is already in the section', async () => {
      const mockSections = [{ id: 'sec-1', name: 'Section A', join_code: 'ABC' }];
      (sectionsApi.getClassSections as jest.Mock).mockResolvedValueOnce(mockSections);
      (sectionProblemsApi.listProblemSections as jest.Mock).mockResolvedValueOnce([
        { id: 'sp-1', section_id: 'sec-1', problem_id: 'prob-1', published_by: 'u-1', show_solution: false, published_at: '2025-01-01T00:00:00Z' },
      ]);

      render(<CreateSessionFromProblemModal {...defaultProps} />);

      await waitFor(() => expect(screen.getByText('Section A')).toBeInTheDocument());

      selectSection('Section A');

      await waitFor(() => {
        expect(screen.getByText(/already published to this section/i)).toBeInTheDocument();
      });
    });

    it('publish checkbox is disabled (forced on)', async () => {
      const mockSections = [{ id: 'sec-1', name: 'Section A', join_code: 'ABC' }];
      (sectionsApi.getClassSections as jest.Mock).mockResolvedValueOnce(mockSections);
      (sectionProblemsApi.listProblemSections as jest.Mock).mockResolvedValueOnce([]);

      render(<CreateSessionFromProblemModal {...defaultProps} />);

      await waitFor(() => expect(screen.getByText('Section A')).toBeInTheDocument());

      selectSection('Section A');

      await waitFor(() => {
        const publishCheckbox = screen.getByRole('checkbox', { name: /publish to section/i });
        expect(publishCheckbox).toBeChecked();
        expect(publishCheckbox).toBeDisabled();
      });
    });

    it('show solution toggle defaults to unchecked', async () => {
      const mockSections = [{ id: 'sec-1', name: 'Section A', join_code: 'ABC' }];
      (sectionsApi.getClassSections as jest.Mock).mockResolvedValueOnce(mockSections);
      (sectionProblemsApi.listProblemSections as jest.Mock).mockResolvedValueOnce([]);

      render(<CreateSessionFromProblemModal {...defaultProps} />);

      await waitFor(() => expect(screen.getByText('Section A')).toBeInTheDocument());

      selectSection('Section A');

      await waitFor(() => {
        expect(screen.getByRole('checkbox', { name: /show solution/i })).not.toBeChecked();
      });
    });

    it('passes showSolution=true to createSession when toggled', async () => {
      const mockSections = [{ id: 'sec-1', name: 'Section A', join_code: 'ABC' }];
      const mockSession = { id: 'session-1', join_code: 'JOIN123' };
      (sectionsApi.getClassSections as jest.Mock).mockResolvedValueOnce(mockSections);
      (sectionProblemsApi.listProblemSections as jest.Mock).mockResolvedValueOnce([]);
      (sessionsApi.createSession as jest.Mock).mockResolvedValueOnce(mockSession);

      render(<CreateSessionFromProblemModal {...defaultProps} />);

      await waitFor(() => expect(screen.getByText('Section A')).toBeInTheDocument());

      selectSection('Section A');

      await waitFor(() => {
        expect(screen.getByRole('checkbox', { name: /show solution/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('checkbox', { name: /show solution/i }));
      fireEvent.click(startButton());

      await waitFor(() => {
        expect(sessionsApi.createSession).toHaveBeenCalledWith('sec-1', 'prob-1', true, {
          setCurrent: true,
        });
      });
    });

    it('passes showSolution=false (default) to createSession when not toggled', async () => {
      const mockSections = [{ id: 'sec-1', name: 'Section A', join_code: 'ABC' }];
      const mockSession = { id: 'session-1', join_code: 'JOIN123' };
      (sectionsApi.getClassSections as jest.Mock).mockResolvedValueOnce(mockSections);
      (sectionProblemsApi.listProblemSections as jest.Mock).mockResolvedValueOnce([]);
      (sessionsApi.createSession as jest.Mock).mockResolvedValueOnce(mockSession);

      render(<CreateSessionFromProblemModal {...defaultProps} />);

      await waitFor(() => expect(screen.getByText('Section A')).toBeInTheDocument());

      selectSection('Section A');

      await waitFor(() => {
        expect(screen.getByRole('checkbox', { name: /show solution/i })).toBeInTheDocument();
      });

      fireEvent.click(startButton());

      await waitFor(() => {
        expect(sessionsApi.createSession).toHaveBeenCalledWith('sec-1', 'prob-1', false, {
          setCurrent: true,
        });
      });
    });
  });

  describe('pointer checkbox', () => {
    it('unchecking "Make this the current problem" passes setCurrent:false', async () => {
      const mockSections = [{ id: 'sec-1', name: 'Section A', join_code: 'ABC' }];
      (sectionsApi.getClassSections as jest.Mock).mockResolvedValueOnce(mockSections);
      // Already published so there is exactly one checkbox (the pointer one).
      (sectionProblemsApi.listProblemSections as jest.Mock).mockResolvedValueOnce([
        { id: 'sp-1', section_id: 'sec-1', problem_id: 'prob-1', published_by: 'u', show_solution: false, published_at: 'x' },
      ]);
      (sessionsApi.createSession as jest.Mock).mockResolvedValueOnce({ id: 'session-1', join_code: 'X' });

      render(<CreateSessionFromProblemModal {...defaultProps} />);

      await waitFor(() => expect(screen.getByText('Section A')).toBeInTheDocument());
      selectSection('Section A');
      await waitFor(() =>
        expect(screen.getByText(/already published to this section/i)).toBeInTheDocument()
      );

      fireEvent.click(
        screen.getByRole('checkbox', { name: /make this the current problem for the class/i })
      );
      fireEvent.click(startButton());

      await waitFor(() => {
        // Already published → showSolution undefined; pointer off → set_current false.
        expect(sessionsApi.createSession).toHaveBeenCalledWith('sec-1', 'prob-1', undefined, {
          setCurrent: false,
        });
      });
    });
  });
});
