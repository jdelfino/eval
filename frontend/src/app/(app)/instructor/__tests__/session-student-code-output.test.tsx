/**
 * @jest-environment jsdom
 */

/**
 * Regression test for coding-tool-ahs
 *
 * Bug: Instructor session view was not passing executionResult to CodeEditor,
 * causing output to display in a redundant OutputPanel instead of the
 * editor's built-in output area.
 *
 * Fix: Pass executionResult prop to CodeEditor component.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// We need to test that CodeEditor receives executionResult when rendered
// in the instructor session context. Since the full instructor page has many
// dependencies, we test the CodeEditor directly with the props pattern used
// by the instructor page.

import CodeEditor from '@/app/(fullscreen)/student/components/CodeEditor';

// Mock Monaco Editor
jest.mock('@monaco-editor/react', () => {
  return function MockEditor({ value }: any) {
    return <textarea data-testid="monaco-editor" defaultValue={value} readOnly />;
  };
});

// Mock ExecutionSettings
jest.mock('@/app/(fullscreen)/student/components/ExecutionSettings', () => {
  return function MockExecutionSettings() {
    return <div data-testid="execution-settings">Settings</div>;
  };
});

// Mock useResponsiveLayout hook
jest.mock('@/hooks/useResponsiveLayout', () => ({
  useResponsiveLayout: jest.fn(() => true), // Desktop
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

describe('Instructor Session - Student Code Output (coding-tool-ahs)', () => {
  it('should display execution result in CodeEditor output area when passed as prop', () => {
    // This test verifies the fix for coding-tool-ahs:
    // When viewing student code in instructor session, execution results
    // should be passed to CodeEditor and displayed in its output area.

    const executionResult = {
      success: true,
      output: 'Hello from student code!',
      error: '',
      executionTime: 42,
    };

    // Render CodeEditor with the same props pattern used in instructor page
    render(
      <CodeEditor
        code="print('Hello from student code!')"
        onChange={() => {}} // Read-only for instructor
        onRun={() => {}}
        isRunning={false}
        readOnly
        problem={{ title: 'Test Problem' }}
        executionResult={executionResult}
      />
    );

    // The output should be displayed in the editor's output area
    expect(screen.getByText('Hello from student code!')).toBeInTheDocument();
    expect(screen.getByText('✓ Success')).toBeInTheDocument();
    expect(screen.getByText(/42ms/)).toBeInTheDocument();
  });

  it('should display error output when execution fails', () => {
    const executionResult = {
      success: false,
      output: '',
      error: 'NameError: name "undefined_var" is not defined',
      executionTime: 15,
    };

    render(
      <CodeEditor
        code="print(undefined_var)"
        onChange={() => {}}
        onRun={() => {}}
        readOnly
        problem={{ title: 'Test Problem' }}
        executionResult={executionResult}
      />
    );

    expect(screen.getByText('✗ Error')).toBeInTheDocument();
    expect(screen.getByText(/NameError/)).toBeInTheDocument();
  });

  it('should show empty state when no execution result yet', () => {
    render(
      <CodeEditor
        code="# Student code here"
        onChange={() => {}}
        onRun={() => {}}
        readOnly
        problem={{ title: 'Test Problem' }}
        executionResult={null}
      />
    );

    expect(screen.getByText('No output yet.')).toBeInTheDocument();
  });
});
