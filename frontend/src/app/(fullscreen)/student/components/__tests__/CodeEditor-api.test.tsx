/**
 * Tests for CodeEditor component with API execution
 * 
 * Tests the new API-based execution feature added for instructor testing.
 * 
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
    return <div data-testid="execution-settings">Execution Settings</div>;
  };
});

// Mock useResponsiveLayout
jest.mock('@/hooks/useResponsiveLayout', () => ({
  useResponsiveLayout: () => true, // Desktop layout
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

describe('CodeEditor Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('WebSocket Execution Mode (default)', () => {
    it('should call onRun callback when run button is clicked', () => {
      const mockOnRun = jest.fn();
      const mockOnChange = jest.fn();

      render(
        <CodeEditor
          code="print('hello')"
          onChange={mockOnChange}
          onRun={mockOnRun}
        />
      );

      const runButton = screen.getByText('▶ Run Code');
      fireEvent.click(runButton);

      expect(mockOnRun).toHaveBeenCalledWith({ 
        stdin: undefined, 
        random_seed: undefined, 
        attached_files: undefined 
      });
    });

    it('should display execution results when provided', () => {
      const mockOnRun = jest.fn();
      const mockOnChange = jest.fn();

      const execution_result = {
        success: true,
        output: 'Hello, World!\n',
        error: '',
        execution_time: 125,
      };

      render(
        <CodeEditor
          code="print('Hello, World!')"
          onChange={mockOnChange}
          onRun={mockOnRun}
          execution_result={execution_result}
        />
      );

      expect(screen.getByText('✓ Success')).toBeInTheDocument();
      expect(screen.getByText(/Execution time: 125ms/)).toBeInTheDocument();
      expect(screen.getByText('Output:')).toBeInTheDocument();
      expect(screen.getByText('Hello, World!')).toBeInTheDocument();
    });

    it('should display error results when execution fails', () => {
      const mockOnRun = jest.fn();
      const mockOnChange = jest.fn();

      const execution_result = {
        success: false,
        output: '',
        error: 'NameError: name "x" is not defined',
        execution_time: 100,
      };

      render(
        <CodeEditor
          code="print(x)"
          onChange={mockOnChange}
          onRun={mockOnRun}
          execution_result={execution_result}
        />
      );

      expect(screen.getByText('✗ Error')).toBeInTheDocument();
      expect(screen.getByText(/Execution time: 100ms/)).toBeInTheDocument();
      expect(screen.getByText('Error:')).toBeInTheDocument();
      expect(screen.getByText('NameError: name "x" is not defined')).toBeInTheDocument();
    });
  });

  describe('API Execution Mode', () => {
    it('should execute code via API when useApiExecution is true', async () => {
      const { executeStandaloneCode } = require('@/lib/api/execute');
      const mockOnChange = jest.fn();

      executeStandaloneCode.mockResolvedValueOnce({
        success: true,
        output: 'API execution result\n',
        error: '',
        execution_time: 150,
      });

      render(
        <CodeEditor
          code="print('API execution')"
          onChange={mockOnChange}
          useApiExecution={true}
        />
      );

      const runButton = screen.getByText('▶ Run Code');
      fireEvent.click(runButton);

      await waitFor(() => {
        expect(executeStandaloneCode).toHaveBeenCalledWith(
          "print('API execution')",
          'python',
          {
            stdin: undefined,
            random_seed: undefined,
            attached_files: undefined,
          }
        );
      });

      await waitFor(() => {
        expect(screen.getByText('✓ Success')).toBeInTheDocument();
        expect(screen.getByText('API execution result')).toBeInTheDocument();
      });
    });

    it('should display error when API execution fails', async () => {
      const { executeStandaloneCode } = require('@/lib/api/execute');
      const mockOnChange = jest.fn();

      executeStandaloneCode.mockRejectedValueOnce(new Error('Execution failed'));

      render(
        <CodeEditor
          code="print('test')"
          onChange={mockOnChange}
          useApiExecution={true}
        />
      );

      const runButton = screen.getByText('▶ Run Code');
      fireEvent.click(runButton);

      await waitFor(() => {
        expect(screen.getByText('✗ Error')).toBeInTheDocument();
        expect(screen.getByText(/Execution failed/)).toBeInTheDocument();
      });
    });

    it('should display error when code is empty', async () => {
      const { executeStandaloneCode } = require('@/lib/api/execute');
      const mockOnChange = jest.fn();

      render(
        <CodeEditor
          code=""
          onChange={mockOnChange}
          useApiExecution={true}
        />
      );

      const runButton = screen.getByText('▶ Run Code');
      fireEvent.click(runButton);

      await waitFor(() => {
        expect(screen.getByText('✗ Error')).toBeInTheDocument();
        expect(screen.getByText(/Please write some code before running/)).toBeInTheDocument();
      });

      expect(executeStandaloneCode).not.toHaveBeenCalled();
    });

    it('should include execution settings in API request', async () => {
      const { executeStandaloneCode } = require('@/lib/api/execute');
      const mockOnChange = jest.fn();
      const mockOnRandomSeedChange = jest.fn();
      const mockOnAttachedFilesChange = jest.fn();

      const attached_files = [{ name: 'data.txt', content: 'test data' }];
      const codeToRun = 'import random\nprint(random.randint(1, 100))';

      executeStandaloneCode.mockResolvedValueOnce({
        success: true,
        output: '42\n',
        error: '',
        execution_time: 125,
      });

      render(
        <CodeEditor
          code={codeToRun}
          onChange={mockOnChange}
          useApiExecution={true}
          random_seed={42}
          onRandomSeedChange={mockOnRandomSeedChange}
          attached_files={attached_files}
          onAttachedFilesChange={mockOnAttachedFilesChange}
          exampleInput="test input"
        />
      );

      const runButton = screen.getByText('▶ Run Code');
      fireEvent.click(runButton);

      await waitFor(() => {
        expect(executeStandaloneCode).toHaveBeenCalled();
      });

      // Check that executeStandaloneCode was called with correct params
      expect(executeStandaloneCode).toHaveBeenCalledWith(
        codeToRun,
        'python',
        {
          stdin: 'test input',
          random_seed: 42,
          attached_files: attached_files,
        }
      );
    });

    it('should show running state during API execution', async () => {
      const { executeStandaloneCode } = require('@/lib/api/execute');
      const mockOnChange = jest.fn();

      let resolvePromise: any;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      executeStandaloneCode.mockReturnValueOnce(promise);

      render(
        <CodeEditor
          code="print('test')"
          onChange={mockOnChange}
          useApiExecution={true}
        />
      );

      const runButton = screen.getByText('▶ Run Code');
      fireEvent.click(runButton);

      // Should show running state
      await waitFor(() => {
        expect(screen.getByText('⏳ Running...')).toBeInTheDocument();
      });

      // Resolve the promise
      resolvePromise({
        success: true,
        output: 'Done\n',
        error: '',
        execution_time: 100,
      });

      // Should show results
      await waitFor(() => {
        expect(screen.getByText('▶ Run Code')).toBeInTheDocument();
        expect(screen.getByText('✓ Success')).toBeInTheDocument();
      });
    });
  });

  describe('Props and customization', () => {
    it('should use custom title when provided', () => {
      const mockOnRun = jest.fn();
      const mockOnChange = jest.fn();

      render(
        <CodeEditor
          code="print('test')"
          onChange={mockOnChange}
          onRun={mockOnRun}
          title="My Custom Code"
        />
      );

      expect(screen.getByText('My Custom Code')).toBeInTheDocument();
    });

    it('should hide run button when showRunButton is false', () => {
      const mockOnChange = jest.fn();

      render(
        <CodeEditor
          code="print('test')"
          onChange={mockOnChange}
          showRunButton={false}
        />
      );

      expect(screen.queryByText('▶ Run Code')).not.toBeInTheDocument();
    });

    it('should be read-only when readOnly is true', () => {
      const mockOnChange = jest.fn();
      const mockOnRun = jest.fn();

      render(
        <CodeEditor
          code="print('test')"
          onChange={mockOnChange}
          onRun={mockOnRun}
          readOnly={true}
        />
      );

      const runButton = screen.getByText('▶ Run Code');
      // Run button should be enabled even in read-only mode
      expect(runButton).not.toBeDisabled();
    });
  });
});
