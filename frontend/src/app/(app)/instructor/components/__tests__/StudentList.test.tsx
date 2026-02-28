/**
 * Unit tests for StudentList component
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import StudentList from '../StudentList';

describe('StudentList', () => {
  const mockOnSelectStudent = jest.fn();
  const mockOnShowOnPublicView = jest.fn();
  const mockOnClearPublicView = jest.fn();
  const mockOnViewHistory = jest.fn();

  const defaultProps = {
    students: [],
    onSelectStudent: mockOnSelectStudent,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Empty state', () => {
    it('should show loading state when isLoading is true', () => {
      render(<StudentList {...defaultProps} isLoading={true} />);

      expect(screen.getByText('Loading students...')).toBeInTheDocument();
      expect(screen.queryByText('Waiting for students to join the session.')).not.toBeInTheDocument();
    });

    it('should show empty state with join code when no students and join_code provided', () => {
      render(<StudentList {...defaultProps} join_code="ABC123" />);

      expect(screen.getByText('Waiting for students to join the session.')).toBeInTheDocument();
      expect(screen.getByText('Share this join code with your students:')).toBeInTheDocument();
      expect(screen.getByText('ABC123')).toBeInTheDocument();
    });

    it('should show empty state without join code when no students and no join_code', () => {
      render(<StudentList {...defaultProps} />);

      expect(screen.getByText('Waiting for students to join the session.')).toBeInTheDocument();
      expect(screen.getByText('Students can join using the session join code displayed in the session controls.')).toBeInTheDocument();
      expect(screen.queryByText('Share this join code with your students:')).not.toBeInTheDocument();
    });

    it('should not show empty state when there are students', () => {
      const students = [
        { id: 'student-1', name: 'Alice', has_code: true },
      ];
      render(<StudentList {...defaultProps} students={students} />);

      expect(screen.queryByText('Waiting for students to join the session.')).not.toBeInTheDocument();
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });
  });

  describe('Student list display', () => {
    const students = [
      { id: 'student-1', name: 'Alice', has_code: true },
      { id: 'student-2', name: 'Bob', has_code: false },
    ];

    it('should display the count of connected students', () => {
      render(<StudentList {...defaultProps} students={students} />);

      expect(screen.getByText('Connected Students (2)')).toBeInTheDocument();
    });

    it('should display custom header label when provided', () => {
      render(<StudentList {...defaultProps} students={students} headerLabel="Students with this issue" />);

      expect(screen.getByText('Students with this issue (2)')).toBeInTheDocument();
    });

    it('should display each student name', () => {
      render(<StudentList {...defaultProps} students={students} />);

      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
    });

    it('should show "Not started" badge when student has no code', () => {
      render(<StudentList {...defaultProps} students={students} />);

      expect(screen.getByText('Not started')).toBeInTheDocument();
    });

    it('should show "Inactive" badge when student has code but no last_code_update', () => {
      render(<StudentList {...defaultProps} students={students} />);

      // Alice has code but no last_code_update — should be Inactive
      expect(screen.getByText('Inactive')).toBeInTheDocument();
    });

    it('should show "Active" badge when student has code and last_code_update within 30s', () => {
      const now = Date.now();
      const activeStudents = [
        { id: 'student-1', name: 'Alice', has_code: true, last_code_update: new Date(now - 10_000) },
      ];
      render(<StudentList {...defaultProps} students={activeStudents} />);

      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('should show "Inactive" badge when student has code and last_code_update is older than 30s', () => {
      const now = Date.now();
      const staleStudents = [
        { id: 'student-1', name: 'Alice', has_code: true, last_code_update: new Date(now - 60_000) },
      ];
      render(<StudentList {...defaultProps} students={staleStudents} />);

      expect(screen.getByText('Inactive')).toBeInTheDocument();
    });

    it('should NOT render "In progress" badge at all', () => {
      render(<StudentList {...defaultProps} students={students} />);

      expect(screen.queryByText('In progress')).not.toBeInTheDocument();
    });

    it('should NOT render "Finished" badge even when finished_student_ids is provided', () => {
      // finished_student_ids prop is removed; this tests that old behavior is gone
      const studentsWithCode = [
        { id: 'student-1', name: 'Alice', has_code: true },
      ];
      render(<StudentList {...defaultProps} students={studentsWithCode} />);

      expect(screen.queryByText('Finished')).not.toBeInTheDocument();
    });

    it('should call onSelectStudent when View button is clicked', () => {
      render(<StudentList {...defaultProps} students={students} />);

      const viewButtons = screen.getAllByRole('button', { name: /^View$/i });
      fireEvent.click(viewButtons[0]);

      expect(mockOnSelectStudent).toHaveBeenCalledWith('student-1');
    });
  });

  describe('Badge transitions with timer', () => {
    it('should transition Active badge to Inactive after 30s elapses (10s timer tick)', () => {
      const now = Date.now();
      // Student updated 20s ago — currently Active (< 30s)
      const students = [
        { id: 'student-1', name: 'Alice', has_code: true, last_code_update: new Date(now - 20_000) },
      ];

      render(<StudentList {...defaultProps} students={students} />);

      // Initially Active
      expect(screen.getByText('Active')).toBeInTheDocument();

      // Advance time by 15s — now last_code_update is 35s ago, should be Inactive
      act(() => {
        jest.advanceTimersByTime(15_000);
      });

      expect(screen.getByText('Inactive')).toBeInTheDocument();
      expect(screen.queryByText('Active')).not.toBeInTheDocument();
    });

    it('should set up a 10s interval for badge re-renders', () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      const students = [
        { id: 'student-1', name: 'Alice', has_code: true, last_code_update: new Date() },
      ];

      render(<StudentList {...defaultProps} students={students} />);

      const timerCalls = setIntervalSpy.mock.calls.filter(call => call[1] === 10_000);
      expect(timerCalls.length).toBeGreaterThanOrEqual(1);

      setIntervalSpy.mockRestore();
    });

    it('should clean up the interval on unmount', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      const students = [
        { id: 'student-1', name: 'Alice', has_code: true, last_code_update: new Date() },
      ];

      const { unmount } = render(<StudentList {...defaultProps} students={students} />);
      unmount();

      expect(clearIntervalSpy).toHaveBeenCalled();

      clearIntervalSpy.mockRestore();
    });
  });

  describe('Optional action buttons', () => {
    const students = [
      { id: 'student-1', name: 'Alice', has_code: true },
    ];

    it('should show History button when onViewHistory is provided', () => {
      render(
        <StudentList
          {...defaultProps}
          students={students}
          onViewHistory={mockOnViewHistory}
        />
      );

      const historyButton = screen.getByRole('button', { name: /^History$/i });
      expect(historyButton).toBeInTheDocument();

      fireEvent.click(historyButton);
      expect(mockOnViewHistory).toHaveBeenCalledWith('student-1', 'Alice');
    });

    it('should show Feature button when onShowOnPublicView is provided', () => {
      render(
        <StudentList
          {...defaultProps}
          students={students}
          onShowOnPublicView={mockOnShowOnPublicView}
        />
      );

      const featureButton = screen.getByRole('button', { name: /^Feature$/i });
      expect(featureButton).toBeInTheDocument();

      fireEvent.click(featureButton);
      expect(mockOnShowOnPublicView).toHaveBeenCalledWith('student-1');
    });

    it('should not show optional buttons when handlers are not provided', () => {
      render(<StudentList {...defaultProps} students={students} />);

      expect(screen.queryByRole('button', { name: /^History$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Feature$/i })).not.toBeInTheDocument();
    });
  });

  describe('Featured student indicator', () => {
    const students = [
      { id: 'student-1', name: 'Alice', has_code: true },
      { id: 'student-2', name: 'Bob', has_code: false },
    ];

    it('should highlight the featured student row', () => {
      render(
        <StudentList
          {...defaultProps}
          students={students}
          featured_student_id="student-1"
          onShowOnPublicView={mockOnShowOnPublicView}
        />
      );

      expect(screen.getByText('Featured')).toBeInTheDocument();
    });

    it('should not show featured badge when no student is featured', () => {
      render(
        <StudentList
          {...defaultProps}
          students={students}
          onShowOnPublicView={mockOnShowOnPublicView}
        />
      );

      expect(screen.queryByText('Featured')).not.toBeInTheDocument();
    });

    it('should show featured badge only on the featured student', () => {
      render(
        <StudentList
          {...defaultProps}
          students={students}
          featured_student_id="student-2"
          onShowOnPublicView={mockOnShowOnPublicView}
        />
      );

      const featuredBadge = screen.getByText('Featured');
      expect(featuredBadge).toBeInTheDocument();

      const bobRow = screen.getByTestId('student-row-student-2');
      expect(bobRow.className).toContain('border-emerald');

      const aliceRow = screen.getByTestId('student-row-student-1');
      expect(aliceRow.className).not.toContain('border-emerald');
    });

    it('should update highlight when featured_student_id changes', () => {
      const { rerender } = render(
        <StudentList
          {...defaultProps}
          students={students}
          featured_student_id="student-1"
          onShowOnPublicView={mockOnShowOnPublicView}
        />
      );

      expect(screen.getByTestId('student-row-student-1').className).toContain('border-emerald');
      expect(screen.getByTestId('student-row-student-2').className).not.toContain('border-emerald');

      rerender(
        <StudentList
          {...defaultProps}
          students={students}
          featured_student_id="student-2"
          onShowOnPublicView={mockOnShowOnPublicView}
        />
      );

      expect(screen.getByTestId('student-row-student-1').className).not.toContain('border-emerald');
      expect(screen.getByTestId('student-row-student-2').className).toContain('border-emerald');
    });
  });

  describe('Clear Public View button', () => {
    it('should not render Clear Public View button (moved to SessionControls)', () => {
      const students = [
        { id: 'student-1', name: 'Alice', has_code: true },
      ];
      render(
        <StudentList
          {...defaultProps}
          students={students}
          featured_student_id="student-1"
        />
      );

      expect(screen.queryByTestId('clear-public-view-button')).not.toBeInTheDocument();
    });
  });
});
