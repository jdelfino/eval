/**
 * Tests for ProblemCreator language selector and Java default starter code.
 *
 * Verifies:
 * - Language dropdown renders with Python (default) and Java options
 * - Changing language updates the field in the submitted payload
 * - Switching to Java auto-populates default starter code if empty
 * - Switching to Java does NOT overwrite non-empty starter code
 * - Language defaults to python for new problems
 * - Language is loaded from API when editing existing problems
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProblemCreator from '../ProblemCreator';

// Mock API modules
jest.mock('@/lib/api/classes', () => ({
  listClasses: jest.fn(),
}));

jest.mock('@/lib/api/problems', () => ({
  getProblem: jest.fn(),
  createProblem: jest.fn(),
  updateProblem: jest.fn(),
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

// Mock useResponsiveLayout
jest.mock('@/hooks/useResponsiveLayout', () => ({
  useResponsiveLayout: () => true,
  useSidebarSection: () => ({
    isCollapsed: true,
    toggle: jest.fn(),
    setCollapsed: jest.fn(),
  }),
}));

// Track starter code passed to CodeEditor
let capturedStarterCode: string = '';
let capturedOnLoadStarterCode: ((code: string) => void) | undefined;

// Mock CodeEditor component - exposes problem and language props for testing
jest.mock('@/app/(fullscreen)/student/components/CodeEditor', () => {
  return function MockCodeEditor({ code, onChange, title, onRun, problem, onProblemEdit, editableProblem, onLoadStarterCode }: any) {
    capturedStarterCode = code;
    capturedOnLoadStarterCode = onLoadStarterCode;
    return (
      <div data-testid={`code-editor-${title}`}>
        {editableProblem && problem && onProblemEdit && (
          <div data-testid="editable-problem-sidebar">
            <label htmlFor="problem-title">Title *</label>
            <input
              id="problem-title"
              value={problem.title || ''}
              onChange={(e) => onProblemEdit({ title: e.target.value })}
            />
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
          data-has-run={!!onRun}
        />
      </div>
    );
  };
});

const JAVA_DEFAULT_STARTER = `public class Main {
    public static void main(String[] args) {

    }
}`;

const DEFAULT_CLASSES = [
  { id: 'default-class-1', name: 'Default Class', namespace_id: 'ns-1' },
];

describe('ProblemCreator - Language Selector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedStarterCode = '';
    capturedOnLoadStarterCode = undefined;
    const { listClasses } = require('@/lib/api/classes');
    listClasses.mockResolvedValue(DEFAULT_CLASSES);
  });

  describe('Language selector rendering', () => {
    it('should render a language selector dropdown', () => {
      render(<ProblemCreator />);

      const languageSelect = screen.getByLabelText('Language');
      expect(languageSelect).toBeInTheDocument();
    });

    it('should default to python for new problems', () => {
      render(<ProblemCreator />);

      const languageSelect = screen.getByLabelText('Language') as HTMLSelectElement;
      expect(languageSelect.value).toBe('python');
    });

    it('should have Python and Java options', () => {
      render(<ProblemCreator />);

      const languageSelect = screen.getByLabelText('Language');
      expect(screen.getByRole('option', { name: 'Python' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Java' })).toBeInTheDocument();
    });
  });

  describe('Language field in submitted payload', () => {
    it('should include language: python in create payload by default', async () => {
      const { createProblem } = require('@/lib/api/problems');
      createProblem.mockResolvedValue({ id: 'problem-1' });

      render(<ProblemCreator />);

      await waitFor(() => expect(screen.getByLabelText('Class *')).toBeInTheDocument());

      fireEvent.change(screen.getByLabelText('Title *'), { target: { value: 'Test Problem' } });
      fireEvent.change(screen.getByLabelText('Class *'), { target: { value: 'default-class-1' } });
      fireEvent.click(screen.getByText('Create Problem'));

      await waitFor(() => {
        expect(createProblem).toHaveBeenCalledWith(
          expect.objectContaining({ language: 'python' })
        );
      });
    });

    it('should include language: java in create payload when Java selected', async () => {
      const { createProblem } = require('@/lib/api/problems');
      createProblem.mockResolvedValue({ id: 'problem-1' });

      render(<ProblemCreator />);

      await waitFor(() => expect(screen.getByLabelText('Class *')).toBeInTheDocument());

      fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'java' } });
      fireEvent.change(screen.getByLabelText('Title *'), { target: { value: 'Test Problem' } });
      fireEvent.change(screen.getByLabelText('Class *'), { target: { value: 'default-class-1' } });
      fireEvent.click(screen.getByText('Create Problem'));

      await waitFor(() => {
        expect(createProblem).toHaveBeenCalledWith(
          expect.objectContaining({ language: 'java' })
        );
      });
    });

    it('should include language in update payload when editing', async () => {
      const { getProblem, updateProblem } = require('@/lib/api/problems');
      const existingProblem = {
        id: 'problem-456',
        title: 'Existing Problem',
        description: 'Original description',
        starter_code: 'def original():\n    pass',
        language: 'python',
        author_id: 'user-1',
      };
      getProblem.mockResolvedValue(existingProblem);
      updateProblem.mockResolvedValue(existingProblem);

      render(<ProblemCreator problem_id="problem-456" />);

      await waitFor(() => {
        expect(screen.getByLabelText('Language')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'java' } });
      fireEvent.click(screen.getByText('Update Problem'));

      await waitFor(() => {
        expect(updateProblem).toHaveBeenCalledWith(
          'problem-456',
          expect.objectContaining({ language: 'java' })
        );
      });
    });
  });

  describe('Java default starter code', () => {
    it('should auto-populate Java default starter code when switching to Java with empty starter code', () => {
      render(<ProblemCreator />);

      // Starter code is empty by default
      expect(screen.getByLabelText(/Starter Code/)).toHaveValue('');

      // Switch to Java
      fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'java' } });

      // Starter code should be populated with Java default
      expect(screen.getByLabelText(/Starter Code/)).toHaveValue(JAVA_DEFAULT_STARTER);
    });

    it('should NOT overwrite non-empty starter code when switching to Java', () => {
      render(<ProblemCreator />);

      // Set some starter code first
      const existingCode = 'def my_function():\n    pass';
      fireEvent.change(screen.getByLabelText(/Starter Code/), {
        target: { value: existingCode },
      });

      // Switch to Java
      fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'java' } });

      // Starter code should remain unchanged
      expect(screen.getByLabelText(/Starter Code/)).toHaveValue(existingCode);
    });

    it('should NOT auto-populate starter code when switching to Python', () => {
      render(<ProblemCreator />);

      // Starter code is empty by default
      expect(screen.getByLabelText(/Starter Code/)).toHaveValue('');

      // Switch to Python (should not populate anything)
      fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'python' } });

      // Starter code should remain empty
      expect(screen.getByLabelText(/Starter Code/)).toHaveValue('');
    });
  });

  describe('Loading existing problem language', () => {
    it('should load language from API and display it in the selector when editing', async () => {
      const { getProblem } = require('@/lib/api/problems');
      getProblem.mockResolvedValue({
        id: 'problem-456',
        title: 'Java Problem',
        description: 'A Java problem',
        starter_code: 'public class Main {}',
        language: 'java',
        author_id: 'user-1',
      });

      render(<ProblemCreator problem_id="problem-456" />);

      await waitFor(() => {
        const languageSelect = screen.getByLabelText('Language') as HTMLSelectElement;
        expect(languageSelect.value).toBe('java');
      });
    });

    it('should default language to python when existing problem has no language field', async () => {
      const { getProblem } = require('@/lib/api/problems');
      getProblem.mockResolvedValue({
        id: 'problem-456',
        title: 'Old Problem',
        description: null,
        starter_code: null,
        author_id: 'user-1',
        // no language field
      });

      render(<ProblemCreator problem_id="problem-456" />);

      await waitFor(() => {
        const languageSelect = screen.getByLabelText('Language') as HTMLSelectElement;
        expect(languageSelect.value).toBe('python');
      });
    });
  });
});
