/**
 * Unit tests for StudentList component
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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
  });

  describe('Empty state', () => {
    it('should show loading state when isLoading is true', () => {
      render(<StudentList {...defaultProps} isLoading={true} />);

      expect(screen.getByText('Loading students...')).toBeInTheDocument();
      expect(screen.queryByText('Waiting for students to join the session.')).not.toBeInTheDocument();
    });

    it('should show empty state with join code when no students and joinCode provided', () => {
      render(<StudentList {...defaultProps} joinCode="ABC123" />);

      expect(screen.getByText('Waiting for students to join the session.')).toBeInTheDocument();
      expect(screen.getByText('Share this join code with your students:')).toBeInTheDocument();
      expect(screen.getByText('ABC123')).toBeInTheDocument();
    });

    it('should show empty state without join code when no students and no joinCode', () => {
      render(<StudentList {...defaultProps} />);

      expect(screen.getByText('Waiting for students to join the session.')).toBeInTheDocument();
      expect(screen.getByText('Students can join using the session join code displayed in the session controls.')).toBeInTheDocument();
      expect(screen.queryByText('Share this join code with your students:')).not.toBeInTheDocument();
    });

    it('should not show empty state when there are students', () => {
      const students = [
        { id: 'student-1', name: 'Alice', hasCode: true },
      ];
      render(<StudentList {...defaultProps} students={students} />);

      expect(screen.queryByText('Waiting for students to join the session.')).not.toBeInTheDocument();
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });
  });

  describe('Student list display', () => {
    const students = [
      { id: 'student-1', name: 'Alice', hasCode: true },
      { id: 'student-2', name: 'Bob', hasCode: false },
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

    it('should indicate which students have started coding', () => {
      render(<StudentList {...defaultProps} students={students} />);

      // Alice has code (no analysis yet, so shows "In progress")
      expect(screen.getByText('In progress')).toBeInTheDocument();
      // Bob does not
      expect(screen.getByText('Not started')).toBeInTheDocument();
    });

    it('should show "Finished" badge when finishedStudentIds is provided', () => {
      render(<StudentList {...defaultProps} students={students} finishedStudentIds={new Set(['student-1'])} />);

      expect(screen.getByText('Finished')).toBeInTheDocument();
      expect(screen.getByText('Not started')).toBeInTheDocument();
    });

    it('should call onSelectStudent when View button is clicked', () => {
      render(<StudentList {...defaultProps} students={students} />);

      const viewButtons = screen.getAllByRole('button', { name: /^View$/i });
      fireEvent.click(viewButtons[0]);

      expect(mockOnSelectStudent).toHaveBeenCalledWith('student-1');
    });
  });

  describe('Optional action buttons', () => {
    const students = [
      { id: 'student-1', name: 'Alice', hasCode: true },
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
      { id: 'student-1', name: 'Alice', hasCode: true },
      { id: 'student-2', name: 'Bob', hasCode: false },
    ];

    it('should highlight the featured student row', () => {
      render(
        <StudentList
          {...defaultProps}
          students={students}
          featuredStudentId="student-1"
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
          featuredStudentId="student-2"
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

    it('should update highlight when featuredStudentId changes', () => {
      const { rerender } = render(
        <StudentList
          {...defaultProps}
          students={students}
          featuredStudentId="student-1"
          onShowOnPublicView={mockOnShowOnPublicView}
        />
      );

      expect(screen.getByTestId('student-row-student-1').className).toContain('border-emerald');
      expect(screen.getByTestId('student-row-student-2').className).not.toContain('border-emerald');

      rerender(
        <StudentList
          {...defaultProps}
          students={students}
          featuredStudentId="student-2"
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
        { id: 'student-1', name: 'Alice', hasCode: true },
      ];
      render(
        <StudentList
          {...defaultProps}
          students={students}
          featuredStudentId="student-1"
        />
      );

      expect(screen.queryByTestId('clear-public-view-button')).not.toBeInTheDocument();
    });
  });
});
