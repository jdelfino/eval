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

// Capture the language prop passed to the MockEditor
let capturedLanguage: string | undefined;

// Mock Monaco Editor - captures language prop
jest.mock('@monaco-editor/react', () => {
  return function MockEditor({ value, onChange, language }: any) {
    capturedLanguage = language;
    return (
      <textarea
        data-testid="monaco-editor"
        data-language={language}
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
  executeCode: jest.fn(),
}));

describe('CodeEditor - Language Awareness', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedLanguage = undefined;
  });

  const baseProblem = {
    id: 'test-problem',
    title: 'Test Problem',
    description: 'Test description',
    starter_code: 'print("hello")',
    test_cases: [],
    author_id: 'test-author',
    namespace_id: 'ns-1',
    class_id: null,
    tags: [],
    solution: null,
    created_at: new Date('2024-01-01T00:00:00Z'),
    updated_at: new Date('2024-01-01T00:00:00Z'),
  };

  describe('Monaco editor language', () => {
    it('should use python as language when problem.language is python', () => {
      const pythonProblem = { ...baseProblem, language: 'python' };

      render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
          problem={pythonProblem}
        />
      );

      const editor = screen.getByTestId('monaco-editor');
      expect(editor).toHaveAttribute('data-language', 'python');
    });

    it('should use java as language when problem.language is java', () => {
      const javaProblem = { ...baseProblem, language: 'java' };

      render(
        <CodeEditor
          code="public class Main {}"
          onChange={jest.fn()}
          problem={javaProblem}
        />
      );

      const editor = screen.getByTestId('monaco-editor');
      expect(editor).toHaveAttribute('data-language', 'java');
    });

    it('should fall back to python as language when problem is null', () => {
      render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
          problem={null}
        />
      );

      const editor = screen.getByTestId('monaco-editor');
      expect(editor).toHaveAttribute('data-language', 'python');
    });
  });

  describe('onRun callback with execution settings', () => {
    it('should call onRun with correct stdin and seed when run button clicked', () => {
      const mockOnRun = jest.fn();
      const pythonProblem = { ...baseProblem, language: 'python' };

      render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
          onRun={mockOnRun}
          defaultTestCases={[{ name: 'Default', input: 'my input', match_type: 'exact' as const, order: 0, random_seed: 42 }]}
          problem={pythonProblem}
        />
      );

      fireEvent.click(screen.getByText('▶ Run Code'));

      expect(mockOnRun).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            input: 'my input',
            random_seed: 42,
          })
        ])
      );
    });

    it('should call onRun with attached_files when provided', () => {
      const mockOnRun = jest.fn();
      const files = [{ name: 'data.txt', content: 'content' }];

      render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
          onRun={mockOnRun}
          defaultTestCases={[{ name: 'Default', input: '', match_type: 'exact' as const, order: 0, attached_files: files }]}
        />
      );

      fireEvent.click(screen.getByText('▶ Run Code'));

      expect(mockOnRun).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            attached_files: files,
          })
        ])
      );
    });
  });
});
