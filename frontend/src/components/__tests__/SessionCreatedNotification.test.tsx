/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import SessionCreatedNotification from '../SessionCreatedNotification';

let channelInstance: { onmessage: ((event: MessageEvent) => void) | null; close: jest.Mock };

beforeEach(() => {
  channelInstance = { onmessage: null, close: jest.fn() };
  (globalThis as Record<string, unknown>).BroadcastChannel = jest.fn().mockImplementation(() => channelInstance);
});

describe('SessionCreatedNotification', () => {
  it('renders nothing initially', () => {
    const { container } = render(<SessionCreatedNotification />);
    expect(container.firstChild).toBeNull();
  });

  it('shows banner when BroadcastChannel message is received', () => {
    render(<SessionCreatedNotification />);

    act(() => {
      channelInstance.onmessage!(new MessageEvent('message', {
        data: { sessionId: 'sess-1', problemTitle: 'Two Sum' },
      }));
    });

    expect(screen.getByText('New session started for Two Sum')).toBeInTheDocument();
    expect(screen.getByText('Go to Session Dashboard')).toHaveAttribute('href', '/instructor/session/sess-1');
  });

  it('dismisses banner when X is clicked', () => {
    render(<SessionCreatedNotification />);

    act(() => {
      channelInstance.onmessage!(new MessageEvent('message', {
        data: { sessionId: 'sess-1', problemTitle: 'Two Sum' },
      }));
    });

    fireEvent.click(screen.getByTestId('dismiss-notification'));
    expect(screen.queryByText('New session started for Two Sum')).not.toBeInTheDocument();
  });

  it('cleans up BroadcastChannel on unmount', () => {
    const { unmount } = render(<SessionCreatedNotification />);
    unmount();
    expect(channelInstance.close).toHaveBeenCalled();
  });
});
