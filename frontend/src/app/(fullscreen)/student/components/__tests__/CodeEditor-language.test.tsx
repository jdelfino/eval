/**
 * Tests for CodeEditor language-aware behavior
 *
 * Verifies that Monaco editor uses the problem's language field
 * and that execute/trace calls pass the correct language.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import CodeEditor from '../CodeEditor';

// Capture the defaultLanguage prop passed to the MockEditor
let capturedDefaultLanguage: string | undefined;

// Mock Monaco Editor - captures defaultLanguage prop
jest.mock('@monaco-editor/react', () => {
  return function MockEditor({ value, onChange, defaultLanguage }: any) {
    capturedDefaultLanguage = defaultLanguage;
    return (
      <textarea
        data-testid="monaco-editor"
        data-default-language={defaultLanguage}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
      />
    );
  };
});

// Mock ExecutionSettings
jest.mock('../ExecutionSettings', () => {
  return function MockExecutionSettings() {
    return <div data-testid="execution-settings">Execution Settings</div>;
  };
});

// Mock useResponsiveLayout
jest.mock('@/hooks/useResponsiveLayout', () => ({
  useResponsiveLayout: () => true,
  useSidebarSection: () => ({
    isCollapsed: true,
    toggle: jest.fn(),
    setCollapsed: jest.fn(),
  }),
  useMobileViewport: () => ({
    isMobile: false,
    isTablet: false,
    isVerySmall: false,
    isDesktop: true,
    width: 1200,
  }),
}));

// Mock the API execute module
jest.mock('@/lib/api/execute', () => ({
  executeStandaloneCode: jest.fn(),
}));

describe('CodeEditor - Language Awareness', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedDefaultLanguage = undefined;
  });

  const baseProblem = {
    id: 'test-problem',
    title: 'Test Problem',
    description: 'Test description',
    starter_code: 'print("hello")',
    test_cases: [],
    execution_settings: null,
    author_id: 'test-author',
    namespace_id: 'ns-1',
    class_id: null,
    tags: [],
    solution: null,
    created_at: new Date('2024-01-01T00:00:00Z'),
    updated_at: new Date('2024-01-01T00:00:00Z'),
  };

  describe('Monaco editor language', () => {
    it('should use python as defaultLanguage when problem.language is python', () => {
      const pythonProblem = { ...baseProblem, language: 'python' };

      render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
          problem={pythonProblem}
        />
      );

      const editor = screen.getByTestId('monaco-editor');
      expect(editor).toHaveAttribute('data-default-language', 'python');
    });

    it('should use java as defaultLanguage when problem.language is java', () => {
      const javaProblem = { ...baseProblem, language: 'java' };

      render(
        <CodeEditor
          code="public class Main {}"
          onChange={jest.fn()}
          problem={javaProblem}
        />
      );

      const editor = screen.getByTestId('monaco-editor');
      expect(editor).toHaveAttribute('data-default-language', 'java');
    });

    it('should fall back to python as defaultLanguage when problem is null', () => {
      render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
          problem={null}
        />
      );

      const editor = screen.getByTestId('monaco-editor');
      expect(editor).toHaveAttribute('data-default-language', 'python');
    });
  });

  describe('API execute calls with language', () => {
    it('should pass python language to executeStandaloneCode when problem.language is python', async () => {
      const { executeStandaloneCode } = require('@/lib/api/execute');
      executeStandaloneCode.mockResolvedValueOnce({
        success: true,
        output: 'Hello\n',
        error: '',
        execution_time_ms: 100,
      });

      const pythonProblem = { ...baseProblem, language: 'python' };

      render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
          useApiExecution={true}
          problem={pythonProblem}
        />
      );

      fireEvent.click(screen.getByText('▶ Run Code'));

      await waitFor(() => {
        expect(executeStandaloneCode).toHaveBeenCalledWith(
          "print('hello')",
          'python',
          expect.any(Object)
        );
      });
    });

    it('should pass java language to executeStandaloneCode when problem.language is java', async () => {
      const { executeStandaloneCode } = require('@/lib/api/execute');
      executeStandaloneCode.mockResolvedValueOnce({
        success: true,
        output: '',
        error: '',
        execution_time_ms: 100,
      });

      const javaProblem = { ...baseProblem, language: 'java' };

      render(
        <CodeEditor
          code="public class Main { public static void main(String[] args) {} }"
          onChange={jest.fn()}
          useApiExecution={true}
          problem={javaProblem}
        />
      );

      fireEvent.click(screen.getByText('▶ Run Code'));

      await waitFor(() => {
        expect(executeStandaloneCode).toHaveBeenCalledWith(
          'public class Main { public static void main(String[] args) {} }',
          'java',
          expect.any(Object)
        );
      });
    });

    it('should fall back to python when no problem is provided', async () => {
      const { executeStandaloneCode } = require('@/lib/api/execute');
      executeStandaloneCode.mockResolvedValueOnce({
        success: true,
        output: 'Hello\n',
        error: '',
        execution_time_ms: 100,
      });

      render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
          useApiExecution={true}
          problem={null}
        />
      );

      fireEvent.click(screen.getByText('▶ Run Code'));

      await waitFor(() => {
        expect(executeStandaloneCode).toHaveBeenCalledWith(
          "print('hello')",
          'python',
          expect.any(Object)
        );
      });
    });
  });
});
