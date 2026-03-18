/**
 * Tests for ProblemCreator's test cases (IOCaseForm) integration.
 *
 * Covers:
 * - Cases section is rendered in ProblemCreator
 * - test_cases submitted correctly on create
 * - test_cases submitted correctly on update
 * - Cases loaded from problem in edit mode
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProblemCreator from '../ProblemCreator';
import type { IOTestCase } from '@/types/problem';

jest.mock('@/lib/api/problems', () => ({
  getProblem: jest.fn(),
  createProblem: jest.fn(),
  updateProblem: jest.fn(),
  generateSolution: jest.fn(),
}));

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

const DEFAULT_CLASSES = [
  { id: 'default-class-1', name: 'Default Class', namespace_id: 'ns-1', description: null, created_by: 'u-1', created_at: '', updated_at: '' },
];

describe('ProblemCreator — Cases Section', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Cases section rendering', () => {
    it('should render the Cases section', async () => {
      render(<ProblemCreator />);
      expect(screen.getByRole('tab', { name: /cases/i })).toBeInTheDocument();
    });

    it('should show IOCaseForm within Cases tab', async () => {
      render(<ProblemCreator />);
      fireEvent.click(screen.getByRole('tab', { name: /cases/i }));
      expect(screen.getByRole('button', { name: /add case/i })).toBeInTheDocument();
    });
  });

  describe('Cases submitted on create', () => {
    it('should include test_cases in create payload', async () => {
      const onProblemCreated = jest.fn();
      const { createProblem } = require('@/lib/api/problems');
      createProblem.mockResolvedValue({ id: 'p-1' });

      render(<ProblemCreator onProblemCreated={onProblemCreated} classes={DEFAULT_CLASSES} />);
      fireEvent.change(screen.getByLabelText('Title *'), { target: { value: 'Test Problem' } });
      fireEvent.change(screen.getByLabelText('Class *'), { target: { value: 'default-class-1' } });
      fireEvent.click(screen.getByRole('tab', { name: /cases/i }));
      fireEvent.click(screen.getByRole('button', { name: /add case/i }));
      fireEvent.click(screen.getByRole('button', { name: /create problem/i }));

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

      render(<ProblemCreator onProblemCreated={onProblemCreated} classes={DEFAULT_CLASSES} />);
      fireEvent.change(screen.getByLabelText('Title *'), { target: { value: 'Test' } });
      fireEvent.change(screen.getByLabelText('Class *'), { target: { value: 'default-class-1' } });
      fireEvent.click(screen.getByRole('button', { name: /create problem/i }));

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

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /cases/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('tab', { name: /cases/i }));

      await waitFor(() => {
        expect(screen.getByDisplayValue('Greet World')).toBeInTheDocument();
      });
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

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /update problem/i })).not.toBeDisabled();
      });

      fireEvent.click(screen.getByText('Update Problem'));

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

      render(<ProblemCreator classes={DEFAULT_CLASSES} />);
      fireEvent.change(screen.getByLabelText('Title *'), { target: { value: 'Test' } });
      fireEvent.change(screen.getByLabelText('Class *'), { target: { value: 'default-class-1' } });
      fireEvent.click(screen.getByRole('tab', { name: /cases/i }));
      fireEvent.click(screen.getByRole('button', { name: /add case/i }));

      await waitFor(() => {
        expect(screen.queryAllByRole('button', { name: /remove case/i })).toHaveLength(1);
      });

      fireEvent.click(screen.getByRole('button', { name: /create problem/i }));

      await waitFor(() => {
        expect(createProblem).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(screen.queryAllByRole('button', { name: /remove case/i })).toHaveLength(0);
      });
    });
  });
});
