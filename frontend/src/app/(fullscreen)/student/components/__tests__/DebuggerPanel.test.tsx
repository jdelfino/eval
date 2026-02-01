/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { DebuggerPanel } from '../DebuggerPanel';

describe('DebuggerPanel', () => {
  const defaultProps = {
    currentStep: 0,
    totalSteps: 5,
    currentLine: 1,
    locals: {},
    globals: {},
    previousLocals: {},
    previousGlobals: {},
    callStack: [],
  };

  it('renders debugger output title', () => {
    render(<DebuggerPanel {...defaultProps} />);

    expect(screen.getByText('Debugger Output')).toBeInTheDocument();
  });

  it('displays step counter', () => {
    render(<DebuggerPanel {...defaultProps} />);

    expect(screen.getByText(/step 1 of 5/i)).toBeInTheDocument();
  });

  it('displays current line number', () => {
    render(<DebuggerPanel {...defaultProps} currentLine={42} />);

    expect(screen.getByText(/line 42/i)).toBeInTheDocument();
  });

  it('shows truncation warning when truncated', () => {
    render(<DebuggerPanel {...defaultProps} truncated={true} />);

    expect(screen.getByText(/trace truncated/i)).toBeInTheDocument();
  });

  it('renders VariableInspector with props', () => {
    const props = {
      ...defaultProps,
      locals: { x: 5 },
      globals: { func: '<function>' }
    };

    render(<DebuggerPanel {...props} />);

    expect(screen.getByText('Variables')).toBeInTheDocument();
    expect(screen.getByText('x')).toBeInTheDocument();
  });

  it('renders CallStackPanel when call stack has 2+ entries', () => {
    const props = {
      ...defaultProps,
      callStack: [
        { functionName: '<module>', filename: '<string>', line: 10 },
        { functionName: 'helper', filename: '<string>', line: 5 }
      ]
    };

    render(<DebuggerPanel {...props} />);

    expect(screen.getByText('Call Stack')).toBeInTheDocument();
  });

  it('does not render navigation controls', () => {
    render(<DebuggerPanel {...defaultProps} />);

    // These should NOT be in the panel anymore
    expect(screen.queryByText(/prev/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/next/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/first/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/last/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Exit Debug Mode')).not.toBeInTheDocument();
  });

  it('does not render keyboard shortcut hints', () => {
    render(<DebuggerPanel {...defaultProps} />);

    // Keyboard hints should be in the sidebar, not the output panel
    expect(screen.queryByText(/keyboard:/i)).not.toBeInTheDocument();
  });
});
