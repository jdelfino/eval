/**
 * Tests for CasesPanel component
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CasesPanel } from '../CasesPanel';
import type { IOTestCase, TestResult } from '@/types/problem';

const instructorCase: IOTestCase = {
  name: 'case1',
  input: 'hello',
  expected_output: 'HELLO',
  match_type: 'exact',
  order: 0,
};

const studentCase: IOTestCase = {
  name: 'my_case',
  input: 'world',
  match_type: 'exact',
  order: 1,
};

const passResult: TestResult = {
  name: 'case1',
  type: 'io',
  status: 'passed',
  time_ms: 10,
};

const failResult: TestResult = {
  name: 'case1',
  type: 'io',
  status: 'failed',
  input: 'hello',
  expected: 'HELLO',
  actual: 'hello',
  time_ms: 15,
};

describe('CasesPanel', () => {
  const defaultProps = {
    instructorCases: [instructorCase],
    studentCases: [],
    caseResults: {} as Record<string, TestResult>,
    selectedCase: null,
    isRunning: false,
    onSelectCase: jest.fn(),
    onRunCase: jest.fn(),
    onRunAll: jest.fn(),
    onAddCase: jest.fn(),
    onUpdateStudentCase: jest.fn(),
    onDeleteStudentCase: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders the panel with instructor cases', () => {
      render(<CasesPanel {...defaultProps} />);

      expect(screen.getByText('case1')).toBeInTheDocument();
    });

    it('renders student cases in the same flat list', () => {
      render(
        <CasesPanel
          {...defaultProps}
          studentCases={[studentCase]}
        />
      );

      expect(screen.getByText('case1')).toBeInTheDocument();
      expect(screen.getByText('my_case')).toBeInTheDocument();
    });

    it('renders Run All button', () => {
      render(<CasesPanel {...defaultProps} />);

      expect(screen.getByRole('button', { name: /run all/i })).toBeInTheDocument();
    });

    it('renders Add Case button', () => {
      render(<CasesPanel {...defaultProps} />);

      expect(screen.getByRole('button', { name: /add case/i })).toBeInTheDocument();
    });

    it('shows instructor badge for instructor cases', () => {
      render(<CasesPanel {...defaultProps} />);

      expect(screen.getByText(/instructor/i)).toBeInTheDocument();
    });

    it('shows mine badge for student cases', () => {
      render(
        <CasesPanel
          {...defaultProps}
          studentCases={[studentCase]}
        />
      );

      expect(screen.getByText(/mine/i)).toBeInTheDocument();
    });
  });

  describe('result badges', () => {
    it('shows pass badge when case passed', () => {
      render(
        <CasesPanel
          {...defaultProps}
          caseResults={{ case1: passResult }}
        />
      );

      expect(screen.getByText(/pass/i)).toBeInTheDocument();
    });

    it('shows fail badge when case failed', () => {
      render(
        <CasesPanel
          {...defaultProps}
          caseResults={{ case1: failResult }}
        />
      );

      expect(screen.getByText(/fail/i)).toBeInTheDocument();
    });

    it('shows no result badge when case has not been run', () => {
      render(<CasesPanel {...defaultProps} />);

      expect(screen.queryByText(/pass/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/fail/i)).not.toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('calls onSelectCase when clicking a case', () => {
      const onSelectCase = jest.fn();
      render(<CasesPanel {...defaultProps} onSelectCase={onSelectCase} />);

      fireEvent.click(screen.getByText('case1'));

      expect(onSelectCase).toHaveBeenCalledWith('case1');
    });

    it('calls onRunAll when Run All button is clicked', () => {
      const onRunAll = jest.fn();
      render(<CasesPanel {...defaultProps} onRunAll={onRunAll} />);

      fireEvent.click(screen.getByRole('button', { name: /run all/i }));

      expect(onRunAll).toHaveBeenCalled();
    });

    it('calls onRunCase when individual run button is clicked', () => {
      const onRunCase = jest.fn();
      render(<CasesPanel {...defaultProps} onRunCase={onRunCase} />);

      const runButtons = screen.getAllByRole('button', { name: /run/i });
      // Individual run button (not "Run All")
      const individualRunButton = runButtons.find(
        btn => !btn.textContent?.toLowerCase().includes('all')
      );
      expect(individualRunButton).toBeDefined();
      fireEvent.click(individualRunButton!);

      expect(onRunCase).toHaveBeenCalledWith('case1');
    });

    it('calls onAddCase when Add Case is clicked', () => {
      const onAddCase = jest.fn();
      render(<CasesPanel {...defaultProps} onAddCase={onAddCase} />);

      fireEvent.click(screen.getByRole('button', { name: /add case/i }));

      expect(onAddCase).toHaveBeenCalled();
    });

    it('highlights selected case', () => {
      const { container } = render(
        <CasesPanel {...defaultProps} selectedCase="case1" />
      );

      // Selected case item should have a distinguishing class or attribute
      const caseItem = container.querySelector('[data-selected="true"]');
      expect(caseItem).toBeInTheDocument();
    });
  });

  describe('run all button state', () => {
    it('disables Run All button when isRunning is true', () => {
      render(<CasesPanel {...defaultProps} isRunning={true} />);

      const runAllButton = screen.getByRole('button', { name: /run all/i });
      expect(runAllButton).toBeDisabled();
    });

    it('enables Run All button when not running', () => {
      render(<CasesPanel {...defaultProps} isRunning={false} />);

      const runAllButton = screen.getByRole('button', { name: /run all/i });
      expect(runAllButton).not.toBeDisabled();
    });
  });

  describe('selected case detail view', () => {
    it('shows selected case input when a case is selected', () => {
      render(
        <CasesPanel
          {...defaultProps}
          selectedCase="case1"
        />
      );

      // Should show the input detail for the selected case
      expect(screen.getByText('hello')).toBeInTheDocument();
    });

    it('shows expected output for instructor case with expected output', () => {
      render(
        <CasesPanel
          {...defaultProps}
          selectedCase="case1"
        />
      );

      expect(screen.getByText('HELLO')).toBeInTheDocument();
    });

    it('allows editing student case input', () => {
      const onUpdateStudentCase = jest.fn();
      render(
        <CasesPanel
          {...defaultProps}
          studentCases={[studentCase]}
          selectedCase="my_case"
          onUpdateStudentCase={onUpdateStudentCase}
        />
      );

      // Student case input should be editable (textarea or input)
      const inputField = screen.getAllByRole('textbox').find(
        el => (el as HTMLTextAreaElement).value === 'world'
      );
      expect(inputField).toBeDefined();
    });

    it('shows read-only input for instructor case', () => {
      render(
        <CasesPanel
          {...defaultProps}
          selectedCase="case1"
        />
      );

      // Instructor case input should be read-only
      const inputArea = screen.getByDisplayValue('hello');
      expect(inputArea).toHaveAttribute('readOnly');
    });

    it('shows delete button for student cases', () => {
      render(
        <CasesPanel
          {...defaultProps}
          studentCases={[studentCase]}
          selectedCase="my_case"
        />
      );

      expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
    });

    it('calls onDeleteStudentCase when delete is clicked for student case', () => {
      const onDeleteStudentCase = jest.fn();
      render(
        <CasesPanel
          {...defaultProps}
          studentCases={[studentCase]}
          selectedCase="my_case"
          onDeleteStudentCase={onDeleteStudentCase}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /delete/i }));

      expect(onDeleteStudentCase).toHaveBeenCalledWith('my_case');
    });
  });

  describe('empty state', () => {
    it('shows empty state message when no cases', () => {
      render(
        <CasesPanel
          {...defaultProps}
          instructorCases={[]}
          studentCases={[]}
        />
      );

      expect(screen.getByText(/no cases/i)).toBeInTheDocument();
    });
  });
});
