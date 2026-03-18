/**
 * Tests for CodeEditor wiring of case CRUD callbacks to CasesPanel.
 *
 * PLAT-x0ii: Student case CRUD callbacks are no-op stubs — add/edit/delete broken
 *
 * Verifies that onAddCase, onUpdateStudentCase, onDeleteStudentCase props are
 * wired through to CasesPanel instead of being swallowed as no-ops.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import CodeEditor from '../CodeEditor';
import type { IOTestCase } from '@/types/problem';

// ---------------------------------------------------------------------------
// Monaco mock
// ---------------------------------------------------------------------------

jest.mock('@monaco-editor/react', () => {
  return function MockEditor({ onMount }: any) {
    React.useEffect(() => {
      if (onMount) {
        onMount({
          focus: jest.fn(),
          trigger: jest.fn(),
          deltaDecorations: jest.fn(() => []),
          getModel: jest.fn(() => null),
        });
      }
    }, [onMount]);
    return <textarea data-testid="monaco-editor" />;
  };
});

// ---------------------------------------------------------------------------
// Layout mocks — desktop layout so CasesPanel sidebar renders
// ---------------------------------------------------------------------------

jest.mock('@/hooks/useResponsiveLayout', () => ({
  useResponsiveLayout: jest.fn(() => true),
  useSidebarSection: jest.fn(() => ({
    isCollapsed: false, // sidebar open so CasesPanel renders
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

jest.mock('lucide-react', () => ({
  Undo2: (props: any) => <svg data-testid="undo-icon" {...props} />,
  Redo2: (props: any) => <svg data-testid="redo-icon" {...props} />,
  ChevronLeft: () => <span data-testid="icon-chevron-left" />,
  ChevronRight: () => <span data-testid="icon-chevron-right" />,
}));

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const studentCase: IOTestCase = {
  name: 'my-case',
  input: 'hello',
  match_type: 'exact',
  order: 0,
};

const caseRunner = {
  caseResults: {},
  selectedCase: 'my-case',
  isRunning: false,
  error: null,
  selectCase: jest.fn(),
  runCase: jest.fn(),
  runAllCases: jest.fn(),
  clearResults: jest.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CodeEditor — case CRUD callback wiring (PLAT-x0ii)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('desktop CasesPanel sidebar', () => {
    it('calls onAddCase prop when Add Case is clicked in the sidebar', () => {
      const onAddCase = jest.fn();

      render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
          caseRunner={caseRunner}
          instructorCases={[]}
          studentCases={[studentCase]}
          onAddCase={onAddCase}
          onUpdateStudentCase={jest.fn()}
          onDeleteStudentCase={jest.fn()}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /add case/i }));

      expect(onAddCase).toHaveBeenCalled();
    });

    it('calls onDeleteStudentCase prop when Delete is clicked for a student case', () => {
      const onDeleteStudentCase = jest.fn();

      render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
          caseRunner={caseRunner}
          instructorCases={[]}
          studentCases={[studentCase]}
          onAddCase={jest.fn()}
          onUpdateStudentCase={jest.fn()}
          onDeleteStudentCase={onDeleteStudentCase}
        />
      );

      // The delete button appears in the case detail (a student case is selected)
      const deleteButton = screen.getByRole('button', { name: /delete my-case/i });
      fireEvent.click(deleteButton);

      expect(onDeleteStudentCase).toHaveBeenCalledWith('my-case');
    });

    it('calls onUpdateStudentCase prop when student case input is edited', () => {
      const onUpdateStudentCase = jest.fn();

      render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
          caseRunner={caseRunner}
          instructorCases={[]}
          studentCases={[studentCase]}
          onAddCase={jest.fn()}
          onUpdateStudentCase={onUpdateStudentCase}
          onDeleteStudentCase={jest.fn()}
        />
      );

      // Find the editable textarea with the student case input value
      const inputArea = screen.getByDisplayValue('hello');
      fireEvent.change(inputArea, { target: { value: 'world' } });

      expect(onUpdateStudentCase).toHaveBeenCalledWith('my-case', { input: 'world' });
    });
  });
});
