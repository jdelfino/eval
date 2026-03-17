/**
 * Tests for ProblemCreator's test cases (IOCaseForm) integration.
 *
 * Covers:
 * - Cases section is rendered in ProblemCreator
 * - test_cases submitted correctly on create
 * - test_cases submitted correctly on update
 * - Cases loaded from problem in edit mode
 * - Cases section replaces (or coexists with) execution settings
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProblemCreator from '../ProblemCreator';
import type { IOTestCase } from '@/types/problem';

// Mock API modules
jest.mock('@/lib/api/classes', () => ({
  listClasses: jest.fn().mockResolvedValue([]),
}));

jest.mock('@/lib/api/problems', () => ({
  getProblem: jest.fn(),
  createProblem: jest.fn(),
  updateProblem: jest.fn(),
  generateSolution: jest.fn(),
}));

// Mock useApiDebugger hook
jest.mock('@/hooks/useApiDebugger', () => ({
  useApiDebugger: () => ({
    trace: null,
    currentStep: 0,
    isLoading: false,
    error: null,
    hasTrace: false,
    total_steps: 0,
    canStepForward: false,
    canStepBackward: false,
    requestTrace: jest.fn(),
    setTrace: jest.fn(),
    setError: jest.fn(),
    stepForward: jest.fn(),
    stepBackward: jest.fn(),
    jumpToStep: jest.fn(),
    jumpToFirst: jest.fn(),
    jumpToLast: jest.fn(),
    reset: jest.fn(),
    getCurrentStep: jest.fn(() => null),
    getCurrentLocals: jest.fn(() => ({})),
    getCurrentGlobals: jest.fn(() => ({})),
    getCurrentCallStack: jest.fn(() => []),
    getPreviousStep: jest.fn(() => null),
  }),
}));

jest.mock('@/hooks/useResponsiveLayout', () => ({
  useResponsiveLayout: () => true,
  useSidebarSection: () => ({
    isCollapsed: true,
    toggle: jest.fn(),
    setCollapsed: jest.fn(),
  }),
}));

// Mock CodeEditor component (same pattern as ProblemCreator.test.tsx)
jest.mock('@/app/(fullscreen)/student/components/CodeEditor', () => {
  return function MockCodeEditor({ code, onChange, title, problem, onProblemEdit, editableProblem }: any) {
    return (
      <div data-testid={`code-editor-${title}`}>
        {editableProblem && problem && onProblemEdit && (
          <div data-testid="editable-problem-sidebar">
            <label htmlFor="problem-description">Description</label>
            <textarea
              id="problem-description"
              value={problem.description || ''}
              onChange={(e) => onProblemEdit({ description: e.target.value })}
            />
          </div>
        )}
        <label htmlFor={`code-${title}`}>{title}</label>
        <textarea
          id={`code-${title}`}
          aria-label={title}
          value={code}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  };
});

describe('ProblemCreator — Cases Section', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { listClasses } = require('@/lib/api/classes');
    listClasses.mockResolvedValue([]);
  });

  describe('Cases section rendering', () => {
    it('should render the Cases section', () => {
      render(<ProblemCreator />);
      // Should have a tab or section for Cases
      expect(screen.getByRole('tab', { name: /cases/i })).toBeInTheDocument();
    });

    it('should show IOCaseForm within Cases tab', async () => {
      render(<ProblemCreator />);
      // Use act() to flush initial async effects (listClasses mock resolution)
      // so any concurrent re-renders don't interfere with the click.
      await act(async () => {
        fireEvent.click(screen.getByRole('tab', { name: /cases/i }));
      });
      // Should render Add Case button
      expect(screen.getByRole('button', { name: /add case/i })).toBeInTheDocument();
    });
  });

  describe('Cases submitted on create', () => {
    it('should include test_cases in create payload', async () => {
      const onProblemCreated = jest.fn();
      const { createProblem } = require('@/lib/api/problems');
      createProblem.mockResolvedValue({ id: 'p-1' });

      render(<ProblemCreator onProblemCreated={onProblemCreated} />);

      // Use act(async) to dispatch events and flush all pending React state updates.
      // In React 18 concurrent mode (jsdom), state updates from fireEvent are not
      // committed synchronously — act() ensures they are committed before proceeding.
      // This also flushes the listClasses() async mock so it doesn't cause
      // "not wrapped in act" warnings on subsequent renders.
      await act(async () => {
        fireEvent.change(screen.getByLabelText('Title *'), { target: { value: 'Test Problem' } });
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('tab', { name: /cases/i }));
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /add case/i }));
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /create problem/i }));
      });

      await waitFor(() => {
        expect(createProblem).toHaveBeenCalledWith(
          expect.objectContaining({
            test_cases: expect.arrayContaining([
              expect.objectContaining({
                name: expect.any(String),
                input: '',
                match_type: 'exact',
                order: 0,
              }),
            ]),
          })
        );
      });
    });

    it('should submit empty test_cases array when no cases defined', async () => {
      const onProblemCreated = jest.fn();
      const { createProblem } = require('@/lib/api/problems');
      createProblem.mockResolvedValue({ id: 'p-2' });

      render(<ProblemCreator onProblemCreated={onProblemCreated} />);

      // Flush title change and pending state before clicking create.
      await act(async () => {
        fireEvent.change(screen.getByLabelText('Title *'), { target: { value: 'Test' } });
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /create problem/i }));
      });

      await waitFor(() => {
        expect(createProblem).toHaveBeenCalledWith(
          expect.objectContaining({
            test_cases: [],
          })
        );
      });
    });
  });

  describe('Cases loaded in edit mode', () => {
    it('should load test_cases from problem and show them in Cases tab', async () => {
      const { getProblem } = require('@/lib/api/problems');
      const testCases: IOTestCase[] = [
        {
          name: 'Greet World',
          input: 'World',
          expected_output: 'Hello, World!',
          match_type: 'exact',
          order: 0,
        },
      ];

      getProblem.mockResolvedValue({
        id: 'p-edit',
        title: 'Existing Problem',
        description: '',
        starter_code: '',
        test_cases: testCases,
      });

      render(<ProblemCreator problem_id="p-edit" />);

      // Wait for loading to finish (tabs appear only when !isLoading)
      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /cases/i })).toBeInTheDocument();
      });

      // Switch to Cases tab
      await act(async () => {
        fireEvent.click(screen.getByRole('tab', { name: /cases/i }));
      });

      expect(screen.getByDisplayValue('Greet World')).toBeInTheDocument();
    });

    it('should include updated test_cases in update payload', async () => {
      const { getProblem, updateProblem } = require('@/lib/api/problems');
      const existingCases: IOTestCase[] = [
        { name: 'Original Case', input: '', match_type: 'exact', order: 0 },
      ];

      getProblem.mockResolvedValue({
        id: 'p-edit',
        title: 'Edit Me',
        description: '',
        starter_code: '',
        test_cases: existingCases,
      });
      updateProblem.mockResolvedValue({ id: 'p-edit', title: 'Edit Me' });

      render(<ProblemCreator problem_id="p-edit" />);

      // Wait for loading to finish (button is enabled when !isLoading and title is set)
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /update problem/i })).not.toBeDisabled();
      });

      await act(async () => {
        fireEvent.click(screen.getByText('Update Problem'));
      });

      await waitFor(() => {
        expect(updateProblem).toHaveBeenCalledWith(
          'p-edit',
          expect.objectContaining({
            test_cases: expect.arrayContaining([
              expect.objectContaining({ name: 'Original Case' }),
            ]),
          })
        );
      });
    });
  });

  describe('Reset after create', () => {
    it('should reset test_cases to empty after successful create', async () => {
      const { createProblem } = require('@/lib/api/problems');
      createProblem.mockResolvedValue({ id: 'p-reset' });

      render(<ProblemCreator />);

      // Flush title change
      await act(async () => {
        fireEvent.change(screen.getByLabelText('Title *'), { target: { value: 'Test' } });
      });

      // Add a case (split into separate acts so the tab re-render completes first)
      await act(async () => {
        fireEvent.click(screen.getByRole('tab', { name: /cases/i }));
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /add case/i }));
      });

      // Verify case is visible
      expect(screen.queryAllByRole('button', { name: /remove case/i })).toHaveLength(1);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /create problem/i }));
      });

      await waitFor(() => {
        expect(createProblem).toHaveBeenCalled();
      });

      // After reset, cases should be empty
      await waitFor(() => {
        expect(screen.queryAllByRole('button', { name: /remove case/i })).toHaveLength(0);
      });
    });
  });
});
