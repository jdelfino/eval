/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { CallStackPanel } from '../CallStackPanel';
import { CallFrame } from '@/server/types';

describe('CallStackPanel', () => {
  it('does not render when call stack has fewer than 2 entries', () => {
    const { container: emptyContainer } = render(<CallStackPanel callStack={[]} />);
    expect(emptyContainer.firstChild).toBeNull();

    const singleFrame: CallFrame[] = [
      { functionName: '<module>', filename: '<string>', line: 1 }
    ];
    const { container: singleContainer } = render(<CallStackPanel callStack={singleFrame} />);
    expect(singleContainer.firstChild).toBeNull();
  });

  it('displays call stack frames', () => {
    const callStack: CallFrame[] = [
      { functionName: '<module>', filename: '<string>', line: 10 },
      { functionName: 'main', filename: '<string>', line: 7 },
      { functionName: 'factorial', filename: '<string>', line: 3 }
    ];

    render(<CallStackPanel callStack={callStack} />);

    expect(screen.getByText('<main program>')).toBeInTheDocument();
    expect(screen.getByText('main')).toBeInTheDocument();
    expect(screen.getByText('factorial')).toBeInTheDocument();
  });

  it('displays line numbers', () => {
    const callStack: CallFrame[] = [
      { functionName: 'main', filename: '<string>', line: 10 },
      { functionName: 'test', filename: '<string>', line: 42 }
    ];

    render(<CallStackPanel callStack={callStack} />);

    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('highlights current frame (last in stack)', () => {
    const callStack: CallFrame[] = [
      { functionName: 'main', filename: '<string>', line: 10 },
      { functionName: 'helper', filename: '<string>', line: 5 }
    ];

    const { container } = render(<CallStackPanel callStack={callStack} />);

    // Last frame should have blue highlight
    const highlightedElements = container.querySelectorAll('.bg-blue-50');
    expect(highlightedElements.length).toBe(1);

    // Arrow indicator should be present
    expect(screen.getByText('→')).toBeInTheDocument();
  });

  it('shows frames in correct order', () => {
    const callStack: CallFrame[] = [
      { functionName: 'first', filename: '<string>', line: 1 },
      { functionName: 'second', filename: '<string>', line: 2 },
      { functionName: 'third', filename: '<string>', line: 3 }
    ];

    const { container } = render(<CallStackPanel callStack={callStack} />);

    const frames = container.querySelectorAll('.font-mono');
    expect(frames[0]).toHaveTextContent('first');
    expect(frames[2]).toHaveTextContent('second');
    expect(frames[4]).toHaveTextContent('third');
  });
});
