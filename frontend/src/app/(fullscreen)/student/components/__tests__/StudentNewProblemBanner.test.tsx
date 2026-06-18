/**
 * @jest-environment jsdom
 */

/**
 * Tests for StudentNewProblemBanner — the "Instructor moved on" banner (mock 09).
 *
 * This banner REPLACES the retired SessionEndedNotification. The assertions for
 * the retired component's "join new session" and "leave to dashboard" actions
 * are redistributed here as the "Jump in" and "Stay here" actions (binding
 * e2e/test redistribution rule, eval-cej.8.12):
 *   - SessionEndedNotification "Join New Session" click → here: "Jump in" click.
 *   - SessionEndedNotification "Leave Session" / dismiss → here: "Stay here" click.
 * SessionEndedNotification's copy-code/clipboard assertions have no home in the
 * persistent-session model (code is auto-saved, never "ended"), so they are
 * intentionally dropped rather than relocated.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import StudentNewProblemBanner from '../StudentNewProblemBanner';

describe('StudentNewProblemBanner', () => {
  const onJumpIn = jest.fn();
  const onStayHere = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the "Instructor moved on — {toProblem}" copy', () => {
    render(
      <StudentNewProblemBanner
        toProblemTitle="Two Sum"
        fromProblemTitle="FizzBuzz"
        onJumpIn={onJumpIn}
        onStayHere={onStayHere}
      />
    );

    expect(screen.getByText(/Instructor moved on — Two Sum/)).toBeInTheDocument();
    // The from-problem name is surfaced in the reassuring subcopy.
    expect(screen.getByText(/FizzBuzz/)).toBeInTheDocument();
  });

  it('renders both "Stay here" and "Jump in" actions', () => {
    render(
      <StudentNewProblemBanner
        toProblemTitle="Two Sum"
        onJumpIn={onJumpIn}
        onStayHere={onStayHere}
      />
    );

    expect(screen.getByTestId('stay-here-button')).toBeInTheDocument();
    expect(screen.getByTestId('jump-in-button')).toBeInTheDocument();
  });

  it('calls onJumpIn when "Jump in" is clicked (redistributed: SessionEnded "Join New Session")', () => {
    render(
      <StudentNewProblemBanner
        toProblemTitle="Two Sum"
        onJumpIn={onJumpIn}
        onStayHere={onStayHere}
      />
    );

    fireEvent.click(screen.getByTestId('jump-in-button'));
    expect(onJumpIn).toHaveBeenCalledTimes(1);
    expect(onStayHere).not.toHaveBeenCalled();
  });

  it('calls onStayHere when "Stay here" is clicked (redistributed: SessionEnded "Leave Session" dismiss)', () => {
    render(
      <StudentNewProblemBanner
        toProblemTitle="Two Sum"
        onJumpIn={onJumpIn}
        onStayHere={onStayHere}
      />
    );

    fireEvent.click(screen.getByTestId('stay-here-button'));
    expect(onStayHere).toHaveBeenCalledTimes(1);
    expect(onJumpIn).not.toHaveBeenCalled();
  });

  it('triggers "Jump in" on Enter (matches the ⏎ affordance)', () => {
    render(
      <StudentNewProblemBanner
        toProblemTitle="Two Sum"
        onJumpIn={onJumpIn}
        onStayHere={onStayHere}
      />
    );

    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onJumpIn).toHaveBeenCalledTimes(1);
  });

  it('reassures that current code will be saved (no "session ended" treatment)', () => {
    render(
      <StudentNewProblemBanner
        toProblemTitle="Two Sum"
        fromProblemTitle="FizzBuzz"
        onJumpIn={onJumpIn}
        onStayHere={onStayHere}
      />
    );

    // Persistent-session model: code is saved, never "ended/disabled".
    expect(screen.getByText(/will be saved/i)).toBeInTheDocument();
    expect(screen.queryByText(/session ended/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/execution is disabled/i)).not.toBeInTheDocument();
  });
});
