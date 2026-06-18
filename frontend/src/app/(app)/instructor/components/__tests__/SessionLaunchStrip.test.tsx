/**
 * Unit tests for SessionLaunchStrip.
 *
 * Contract: the post-launch confirmation strip wires its three actions (Copy
 * code, Cast to projector, Dismiss) and shows the "students see it now" suffix
 * only when the session was made the section's current problem. Action wiring
 * and the set_current copy are the things that silently break on refactor.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SessionLaunchStrip from '../SessionLaunchStrip';

describe('SessionLaunchStrip', () => {
  const baseProps = {
    sectionName: 'CS 101 · Period 3',
    joinCode: 'ABC-123',
    sessionId: 'session-123',
    madeCurrent: true,
    onDismiss: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(navigator, {
      clipboard: { writeText: jest.fn().mockResolvedValue(undefined) },
    });
  });

  it('renders the section name and join code', () => {
    render(<SessionLaunchStrip {...baseProps} />);

    expect(screen.getByText(/Session started for CS 101 · Period 3/)).toBeInTheDocument();
    expect(screen.getByText('ABC-123')).toBeInTheDocument();
  });

  it('copies the join code to the clipboard when Copy code is clicked', async () => {
    render(<SessionLaunchStrip {...baseProps} />);

    fireEvent.click(screen.getByTestId('session-launch-strip-copy'));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('ABC-123');
    });
  });

  it('opens the public view with the session id when Cast is clicked', () => {
    const openSpy = jest.spyOn(window, 'open').mockReturnValue(null);

    render(<SessionLaunchStrip {...baseProps} />);
    fireEvent.click(screen.getByTestId('session-launch-strip-cast'));

    expect(openSpy).toHaveBeenCalledWith(
      '/public-view?session_id=session-123',
      '_blank',
      'width=1200,height=800'
    );
    openSpy.mockRestore();
  });

  it('fires onDismiss when Dismiss is clicked', () => {
    const onDismiss = jest.fn();
    render(<SessionLaunchStrip {...baseProps} onDismiss={onDismiss} />);

    fireEvent.click(screen.getByTestId('session-launch-strip-dismiss'));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('includes " — students see it now" only when madeCurrent is true', () => {
    const { rerender } = render(<SessionLaunchStrip {...baseProps} madeCurrent />);
    expect(screen.getByText(/students see it now/)).toBeInTheDocument();

    rerender(<SessionLaunchStrip {...baseProps} madeCurrent={false} />);
    expect(screen.queryByText(/students see it now/)).not.toBeInTheDocument();
    expect(screen.getByText(/Session started for CS 101 · Period 3/)).toBeInTheDocument();
  });
});
