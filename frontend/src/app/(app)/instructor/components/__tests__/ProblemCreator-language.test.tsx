/**
 * Tests for ProblemCreator language selector and Java default starter code (G2).
 *
 * Language is now controlled via ProblemPropertiesBar's onChangeProperties callback
 * (threaded through WorkspaceShell's propertiesBar slot), not a standalone select.
 * Title is via Ribbon onTitleChange. Class is via onChangeProperties.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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
  // generateSolution intentionally omitted — moved to G7
}));

jest.mock('@/lib/api/execute', () => ({
  executeCode: jest.fn(),
  ioTestCasesToCaseDefs: jest.fn((cases) => cases),
  buildIOTestCases: jest.fn(() => []),
}));

// Capture WorkspaceShell props for interaction with propertiesBar and Ribbon.
let capturedProps: any = null;
jest.mock('@/components/workspace/WorkspaceShell', () => ({
  __esModule: true,
  default: (props: any) => {
    capturedProps = props;
    const { editorTabs, activeTabId, onChangeCode, onSelectTab } = props;
    const activeTab = editorTabs.find((t: any) => t.id === activeTabId) ?? editorTabs[0];
    return (
      <div data-testid="workspace-shell">
        {/* PropertiesBar slot — renders ProblemPropertiesBar */}
        {props.propertiesBar && (
          <div data-testid="properties-bar-slot">{props.propertiesBar}</div>
        )}
        <div>
          {editorTabs.map((tab: any) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={tab.id === activeTabId}
              onClick={() => onSelectTab?.(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {activeTab && activeTab.kind === 'code' && (
          <textarea
            aria-label={activeTab.label}
            value={activeTab.code}
            onChange={(e) => onChangeCode?.(activeTab.id, e.target.value)}
          />
        )}
      </div>
    );
  },
}));

jest.mock('@/lib/testRail', () => ({
  toTestRailItems: jest.fn(() => []),
  toDrawerOutput: jest.fn(() => undefined),
}));

const JAVA_DEFAULT_STARTER = `public class Main {
    public static void main(String[] args) {

    }
}`;

const DEFAULT_CLASSES = [
  { id: 'default-class-1', name: 'Default Class', namespace_id: 'ns-1' },
];

describe('ProblemCreator - Language Selector (G2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedProps = null;
    const { listClasses } = require('@/lib/api/classes');
    listClasses.mockResolvedValue(DEFAULT_CLASSES);
  });

  describe('Language selector via PropertiesBar', () => {
    it('defaults to python for new problems', () => {
      render(<ProblemCreator />);

      // Language defaults to python — check via propertiesBar prop
      expect(capturedProps.propertiesBar.props.problemLanguage).toBe('python');
    });

    it('changing language via onChangeProperties updates editorTabs language', () => {
      render(<ProblemCreator />);

      // Initially python
      const starterTab = capturedProps.editorTabs.find((t: any) => t.id === 'starter');
      expect(starterTab.language).toBe('python');

      // Switch to java via PropertiesBar onChangeProperties
      act(() => {
        capturedProps.propertiesBar.props.onChangeProperties({
          class: null,
          language: 'java',
          tags: [],
        });
      });

      // editorTabs should now be java
      const updatedTab = capturedProps.editorTabs.find((t: any) => t.id === 'starter');
      expect(updatedTab.language).toBe('java');
    });
  });

  describe('Language field in submitted payload', () => {
    it('includes language: python in create payload by default', async () => {
      const { createProblem } = require('@/lib/api/problems');
      createProblem.mockResolvedValue({ id: 'problem-1' });

      render(<ProblemCreator />);

      // Set title + class
      act(() => { capturedProps.onTitleChange('Test Problem'); });
      act(() => {
        capturedProps.propertiesBar.props.onChangeProperties({
          class: 'default-class-1',
          language: 'python',
          tags: [],
        });
      });

      fireEvent.click(screen.getByText('Create Problem'));

      await waitFor(() => {
        expect(createProblem).toHaveBeenCalledWith(
          expect.objectContaining({ language: 'python' })
        );
      });
    });

    it('includes language: java in create payload when Java selected', async () => {
      const { createProblem } = require('@/lib/api/problems');
      createProblem.mockResolvedValue({ id: 'problem-1' });

      render(<ProblemCreator />);

      act(() => {
        capturedProps.propertiesBar.props.onChangeProperties({
          class: 'default-class-1',
          language: 'java',
          tags: [],
        });
      });
      act(() => { capturedProps.onTitleChange('Test Problem'); });

      fireEvent.click(screen.getByText('Create Problem'));

      await waitFor(() => {
        expect(createProblem).toHaveBeenCalledWith(
          expect.objectContaining({ language: 'java' })
        );
      });
    });

    it('includes language in update payload when editing', async () => {
      const { getProblem, updateProblem } = require('@/lib/api/problems');
      const existingProblem = {
        id: 'problem-456',
        title: 'Existing Problem',
        description: 'Original description',
        starter_code: 'def original():\n    pass',
        language: 'python',
        author_id: 'user-1',
        test_cases: [],
      };
      getProblem.mockResolvedValue(existingProblem);
      updateProblem.mockResolvedValue(existingProblem);

      render(<ProblemCreator problem_id="problem-456" />);

      await waitFor(() =>
        expect(screen.queryByText('Loading problem...')).not.toBeInTheDocument()
      );

      // Switch to java via PropertiesBar
      act(() => {
        capturedProps.propertiesBar.props.onChangeProperties({
          class: null,
          language: 'java',
          tags: [],
        });
      });

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
    it('auto-populates Java default starter code when switching to Java with empty starter', () => {
      render(<ProblemCreator />);

      // Starter code is empty by default
      expect(screen.getByLabelText(/Starter Code/)).toHaveValue('');

      // Switch to Java via PropertiesBar
      act(() => {
        capturedProps.propertiesBar.props.onChangeProperties({
          class: null,
          language: 'java',
          tags: [],
        });
      });

      // Starter code should be populated with Java default
      expect(screen.getByLabelText(/Starter Code/)).toHaveValue(JAVA_DEFAULT_STARTER);
    });

    it('does NOT overwrite non-empty starter code when switching to Java', () => {
      render(<ProblemCreator />);

      // Set some starter code first
      const existingCode = 'def my_function():\n    pass';
      fireEvent.change(screen.getByLabelText(/Starter Code/), {
        target: { value: existingCode },
      });

      // Switch to Java via PropertiesBar
      act(() => {
        capturedProps.propertiesBar.props.onChangeProperties({
          class: null,
          language: 'java',
          tags: [],
        });
      });

      // Starter code should remain unchanged
      expect(screen.getByLabelText(/Starter Code/)).toHaveValue(existingCode);
    });

    it('does NOT auto-populate starter code when switching to Python', () => {
      render(<ProblemCreator />);

      // Starter code is empty
      expect(screen.getByLabelText(/Starter Code/)).toHaveValue('');

      // Switch to Python — should not populate
      act(() => {
        capturedProps.propertiesBar.props.onChangeProperties({
          class: null,
          language: 'python',
          tags: [],
        });
      });

      expect(screen.getByLabelText(/Starter Code/)).toHaveValue('');
    });
  });

  describe('Loading existing problem language', () => {
    it('loads language from API and passes it to PropertiesBar when editing', async () => {
      const { getProblem } = require('@/lib/api/problems');
      getProblem.mockResolvedValue({
        id: 'problem-456',
        title: 'Java Problem',
        description: 'A Java problem',
        starter_code: 'public class Main {}',
        language: 'java',
        author_id: 'user-1',
        test_cases: [],
      });

      render(<ProblemCreator problem_id="problem-456" />);

      await waitFor(() =>
        expect(screen.queryByText('Loading problem...')).not.toBeInTheDocument()
      );

      expect(capturedProps.propertiesBar.props.problemLanguage).toBe('java');
    });

    it('defaults language to python when existing problem has no language field', async () => {
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

      await waitFor(() =>
        expect(screen.queryByText('Loading problem...')).not.toBeInTheDocument()
      );

      expect(capturedProps.propertiesBar.props.problemLanguage).toBe('python');
    });
  });
});
