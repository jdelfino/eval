/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { CallStackPanel } from '../CallStackPanel';
import { CallFrame } from '@/types/session';

describe('CallStackPanel', () => {
  it('does not render when call stack has fewer than 2 entries', () => {
    const { container: emptyContainer } = render(<CallStackPanel call_stack={[]} />);
    expect(emptyContainer.firstChild).toBeNull();

    const singleFrame: CallFrame[] = [
      { function_name: '<module>', filename: '<string>', line: 1 }
    ];
    const { container: singleContainer } = render(<CallStackPanel call_stack={singleFrame} />);
    expect(singleContainer.firstChild).toBeNull();
  });

  it('displays call stack frames', () => {
    const call_stack: CallFrame[] = [
      { function_name: '<module>', filename: '<string>', line: 10 },
      { function_name: 'main', filename: '<string>', line: 7 },
      { function_name: 'factorial', filename: '<string>', line: 3 }
    ];

    render(<CallStackPanel call_stack={call_stack} />);

    expect(screen.getByText('<main program>')).toBeInTheDocument();
    expect(screen.getByText('main')).toBeInTheDocument();
    expect(screen.getByText('factorial')).toBeInTheDocument();
  });

  it('displays line numbers', () => {
    const call_stack: CallFrame[] = [
      { function_name: 'main', filename: '<string>', line: 10 },
      { function_name: 'test', filename: '<string>', line: 42 }
    ];

    render(<CallStackPanel call_stack={call_stack} />);

    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('highlights current frame (last in stack)', () => {
    const call_stack: CallFrame[] = [
      { function_name: 'main', filename: '<string>', line: 10 },
      { function_name: 'helper', filename: '<string>', line: 5 }
    ];

    const { container } = render(<CallStackPanel call_stack={call_stack} />);

    // Last frame should have blue highlight
    const highlightedElements = container.querySelectorAll('.bg-blue-50');
    expect(highlightedElements.length).toBe(1);

    // Arrow indicator should be present
    expect(screen.getByText('→')).toBeInTheDocument();
  });

  it('shows frames in correct order', () => {
    const call_stack: CallFrame[] = [
      { function_name: 'first', filename: '<string>', line: 1 },
      { function_name: 'second', filename: '<string>', line: 2 },
      { function_name: 'third', filename: '<string>', line: 3 }
    ];

    const { container } = render(<CallStackPanel call_stack={call_stack} />);

    const frames = container.querySelectorAll('.font-mono');
    expect(frames[0]).toHaveTextContent('first');
    expect(frames[2]).toHaveTextContent('second');
    expect(frames[4]).toHaveTextContent('third');
  });
});
