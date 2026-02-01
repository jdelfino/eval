/**
 * Tests for CodeEditor empty states
 *
 * These tests verify the empty state messages shown in the output panel
 * when no execution result is available, particularly distinguishing
 * between having a problem loaded vs waiting for one.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import CodeEditor from '../CodeEditor';

// Mock Monaco Editor
jest.mock('@monaco-editor/react', () => {
  return function MockEditor({ value, onChange }: any) {
    return (
      <textarea
        data-testid="monaco-editor"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  };
});

// Mock ExecutionSettings
jest.mock('../ExecutionSettings', () => {
  return function MockExecutionSettings() {
    return <div data-testid="execution-settings">Settings</div>;
  };
});

// Mock useResponsiveLayout hook
jest.mock('@/hooks/useResponsiveLayout', () => ({
  useResponsiveLayout: jest.fn(() => true), // Default to desktop
  useSidebarSection: jest.fn(() => ({
    isCollapsed: true,
    toggle: jest.fn(),
    setCollapsed: jest.fn(),
  })),
  useMobileViewport: jest.fn(() => ({
    isMobile: false,
    isTablet: false,
    isVerySmall: false,
    isDesktop: true,
    width: 1200,
  })),
}));

describe('CodeEditor Empty States', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Output panel empty states', () => {
    it('should show "waiting for problem" message when no problem is loaded', () => {
      render(
        <CodeEditor
          code=""
          onChange={jest.fn()}
          problem={null}
        />
      );

      expect(screen.getByText('Waiting for instructor to load a problem...')).toBeInTheDocument();
      expect(screen.getByText('You can start writing code while you wait.')).toBeInTheDocument();
    });

    it('should show "no output yet" message when problem is loaded but no result', () => {
      render(
        <CodeEditor
          code=""
          onChange={jest.fn()}
          problem={{ title: 'Test Problem', description: 'A test problem' }}
        />
      );

      expect(screen.getByText('No output yet.')).toBeInTheDocument();
      expect(screen.getByText('Click "Run Code" to execute your program and see the results here.')).toBeInTheDocument();
    });

    it('should not show empty state when execution result is present', () => {
      const executionResult = {
        success: true,
        output: 'Hello, World!',
        error: '',
        executionTime: 10,
      };

      render(
        <CodeEditor
          code="print('Hello, World!')"
          onChange={jest.fn()}
          problem={{ title: 'Test Problem' }}
          executionResult={executionResult}
        />
      );

      expect(screen.queryByText('Waiting for instructor to load a problem...')).not.toBeInTheDocument();
      expect(screen.queryByText('No output yet.')).not.toBeInTheDocument();
      expect(screen.getByText('Hello, World!')).toBeInTheDocument();
    });

    it('should show empty state with undefined problem', () => {
      render(
        <CodeEditor
          code=""
          onChange={jest.fn()}
          problem={undefined}
        />
      );

      expect(screen.getByText('Waiting for instructor to load a problem...')).toBeInTheDocument();
    });
  });

  describe('Problem panel empty states', () => {
    it('should not show problem button in activity bar when no problem', () => {
      render(
        <CodeEditor
          code=""
          onChange={jest.fn()}
          problem={null}
        />
      );

      // Problem button should not be in document when no problem
      expect(screen.queryByRole('button', { name: 'Problem' })).not.toBeInTheDocument();
    });

    it('should show problem button in activity bar when problem is loaded', () => {
      render(
        <CodeEditor
          code=""
          onChange={jest.fn()}
          problem={{ title: 'Test Problem', description: 'Description here' }}
        />
      );

      // Problem button should be present
      expect(screen.getByRole('button', { name: 'Problem' })).toBeInTheDocument();
    });
  });
});
