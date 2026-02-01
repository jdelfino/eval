/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import CodeEditor from '../CodeEditor';

// Mock Monaco Editor
jest.mock('@monaco-editor/react', () => {
  return function MockEditor({ onMount }: any) {
    React.useEffect(() => {
      if (onMount) {
        const mockEditor = {
          focus: jest.fn(),
          getModel: jest.fn(() => ({
            getFullModelRange: jest.fn(() => ({
              startLineNumber: 1,
              startColumn: 1,
              endLineNumber: 1,
              endColumn: 1,
            })),
          })),
          executeEdits: jest.fn(),
          deltaDecorations: jest.fn().mockReturnValue([]),
        };
        onMount(mockEditor);
      }
    }, [onMount]);
    return <div data-testid="monaco-editor">Monaco Editor</div>;
  };
});

// Mock useResponsiveLayout - use actual useSidebarSection to test localStorage persistence
jest.mock('@/hooks/useResponsiveLayout', () => {
  const actual = jest.requireActual('@/hooks/useResponsiveLayout');
  return {
    ...actual,
    useResponsiveLayout: () => true, // Desktop layout
    useMobileViewport: () => ({
      isMobile: false,
      isTablet: false,
      isVerySmall: false,
      isDesktop: true,
      width: 1200,
    }),
  };
});

describe('CodeEditor - Problem Sidebar', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  it('should show problem sidebar open by default when problem exists', async () => {
    const problem = {
      id: 'problem-1',
      authorId: 'instructor-1',
      title: 'Test Problem',
      description: 'This is a test problem description',
      starterCode: 'def solution():\n    pass',
      executionSettings: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    render(
      <CodeEditor
        code=""
        onChange={jest.fn()}
        problem={problem}
        onLoadStarterCode={jest.fn()}
      />
    );

    // Problem panel should be visible
    await waitFor(() => {
      expect(screen.getByText('Test Problem')).toBeInTheDocument();
    });

    expect(screen.getByText('This is a test problem description')).toBeInTheDocument();
    expect(screen.getByText('Restore Starter Code')).toBeInTheDocument();
  });

  it('should persist sidebar state in localStorage', async () => {
    const problem = {
      id: 'problem-1',
      authorId: 'instructor-1',
      title: 'Test Problem',
      description: 'Test description',
      starterCode: 'def solution():\n    pass',
      executionSettings: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const { rerender } = render(
      <CodeEditor
        code=""
        onChange={jest.fn()}
        problem={problem}
        onLoadStarterCode={jest.fn()}
      />
    );

    // Problem panel should be visible initially
    await waitFor(() => {
      expect(screen.getByText('Test Problem')).toBeInTheDocument();
    });

    // Close the panel by clicking the close button
    const closeButton = screen.getByLabelText('Close panel');
    await act(async () => {
      closeButton.click();
    });

    // Wait for localStorage to update
    await waitFor(() => {
      const collapsed = localStorage.getItem('sidebar-problem-panel-collapsed');
      expect(collapsed).toBe('true');
    });

    // Problem panel should now be hidden
    expect(screen.queryByText('Test Problem')).not.toBeInTheDocument();

    // Unmount and remount to test persistence
    rerender(
      <CodeEditor
        code="# test code"
        onChange={jest.fn()}
        problem={problem}
        onLoadStarterCode={jest.fn()}
      />
    );

    // Problem panel should remain closed after remount
    expect(screen.queryByText('Test Problem')).not.toBeInTheDocument();
  });

  it('should show execution settings collapsed by default when problem is present', async () => {
    const problem = {
      id: 'problem-1',
      authorId: 'instructor-1',
      title: 'Test Problem',
      description: 'Test description',
      starterCode: 'def solution():\n    pass',
      executionSettings: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    render(
      <CodeEditor
        code=""
        onChange={jest.fn()}
        problem={problem}
        onLoadStarterCode={jest.fn()}
        onRun={jest.fn()}
      />
    );

    // Problem should be visible
    await waitFor(() => {
      expect(screen.getByText('Test Problem')).toBeInTheDocument();
    });

    // Execution Settings should not be visible (settings collapsed, problem open)
    expect(screen.queryByText('Execution Settings')).not.toBeInTheDocument();
  });
});
