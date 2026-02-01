/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ConnectionStatus, ConnectionState } from '../ConnectionStatus';

describe('ConnectionStatus', () => {
  describe('Badge variant (default)', () => {
    describe('Connected state', () => {
      it('renders connected status with green indicator', () => {
        render(<ConnectionStatus status="connected" />);

        const container = screen.getByTestId('connection-status');
        expect(container).toHaveAttribute('data-status', 'connected');
        expect(screen.getByText('Connected')).toBeInTheDocument();
      });

      it('does not show description when connected', () => {
        render(<ConnectionStatus status="connected" />);

        expect(screen.queryByTestId('connection-status-description')).not.toBeInTheDocument();
      });

      it('does not show reconnect button when connected', () => {
        render(<ConnectionStatus status="connected" onReconnect={jest.fn()} />);

        expect(screen.queryByTestId('reconnect-button')).not.toBeInTheDocument();
      });
    });

    describe('Connecting state', () => {
      it('renders connecting status with guidance message', () => {
        render(<ConnectionStatus status="connecting" />);

        const container = screen.getByTestId('connection-status');
        expect(container).toHaveAttribute('data-status', 'connecting');
        expect(screen.getByText('Connecting...')).toBeInTheDocument();
        expect(screen.getByTestId('connection-status-description')).toHaveTextContent(
          'Please wait, establishing connection'
        );
      });

      it('does not show reconnect button when connecting', () => {
        render(<ConnectionStatus status="connecting" onReconnect={jest.fn()} />);

        expect(screen.queryByTestId('reconnect-button')).not.toBeInTheDocument();
      });

      it('shows elapsed time when connectionStartTime is provided', () => {
        const connectionStartTime = Date.now() - 3000; // 3 seconds ago

        render(
          <ConnectionStatus
            status="connecting"
            connectionStartTime={connectionStartTime}
            timeoutThreshold={10000}
          />
        );

        expect(screen.getByText(/Connecting\.\.\. 3s \/ 10s/)).toBeInTheDocument();
      });
    });

    describe('Disconnected state', () => {
      it('renders disconnected status as banner with reconnecting message', () => {
        render(<ConnectionStatus status="disconnected" />);

        // Disconnected state forces banner variant for visibility
        const container = screen.getByTestId('connection-status-banner');
        expect(container).toHaveAttribute('data-status', 'disconnected');
        expect(screen.getByText('Disconnected')).toBeInTheDocument();
        expect(screen.getByTestId('connection-status-description')).toHaveTextContent(
          'Connection lost. Attempting to reconnect...'
        );
      });

      it('shows reconnect attempt count when reconnecting', () => {
        render(
          <ConnectionStatus
            status="disconnected"
            reconnectAttempt={2}
            maxReconnectAttempts={5}
          />
        );

        expect(screen.getByTestId('connection-status-description')).toHaveTextContent(
          'Reconnecting (attempt 2 of 5)...'
        );
      });

      it('shows Retry Now button in disconnected state', () => {
        const onReconnect = jest.fn();
        render(<ConnectionStatus status="disconnected" onReconnect={onReconnect} />);

        const button = screen.getByTestId('reconnect-button');
        expect(button).toBeInTheDocument();
        expect(button).toHaveTextContent('Retry Now');

        fireEvent.click(button);
        expect(onReconnect).toHaveBeenCalledTimes(1);
      });

      it('shows troubleshooting steps after multiple reconnect attempts', () => {
        render(
          <ConnectionStatus
            status="disconnected"
            reconnectAttempt={2}
            maxReconnectAttempts={5}
          />
        );

        const steps = screen.getByTestId('troubleshooting-steps');
        expect(steps).toBeInTheDocument();
        expect(steps).toHaveTextContent('Check your internet connection');
      });
    });

    describe('Failed state', () => {
      it('renders failed status as banner with error message', () => {
        render(<ConnectionStatus status="failed" />);

        // Failed state forces banner variant for visibility
        const container = screen.getByTestId('connection-status-banner');
        expect(container).toHaveAttribute('data-status', 'failed');
        expect(screen.getByText('Connection Failed')).toBeInTheDocument();
        expect(screen.getByTestId('connection-status-description')).toHaveTextContent(
          'Unable to establish connection to the server.'
        );
      });

      it('shows custom error message when provided', () => {
        render(
          <ConnectionStatus
            status="failed"
            error="Server is unavailable"
          />
        );

        expect(screen.getByTestId('connection-status-description')).toHaveTextContent(
          'Server is unavailable'
        );
      });

      it('shows Retry Now button in failed state', () => {
        const onReconnect = jest.fn();
        render(<ConnectionStatus status="failed" onReconnect={onReconnect} />);

        const button = screen.getByTestId('reconnect-button');
        expect(button).toBeInTheDocument();
        expect(button).toHaveTextContent('Retry Now');
      });

      it('calls onReconnect when button is clicked', () => {
        const onReconnect = jest.fn();
        render(<ConnectionStatus status="failed" onReconnect={onReconnect} />);

        fireEvent.click(screen.getByTestId('reconnect-button'));
        expect(onReconnect).toHaveBeenCalledTimes(1);
      });

      it('disables reconnect button when reconnecting', () => {
        const onReconnect = jest.fn();
        render(
          <ConnectionStatus
            status="failed"
            onReconnect={onReconnect}
            isReconnecting={true}
          />
        );

        const button = screen.getByTestId('reconnect-button');
        expect(button).toBeDisabled();
        expect(button).toHaveTextContent('Reconnecting...');
      });

      it('does not call onReconnect when button is disabled', () => {
        const onReconnect = jest.fn();
        render(
          <ConnectionStatus
            status="failed"
            onReconnect={onReconnect}
            isReconnecting={true}
          />
        );

        fireEvent.click(screen.getByTestId('reconnect-button'));
        expect(onReconnect).not.toHaveBeenCalled();
      });

      it('shows troubleshooting steps for failed state', () => {
        render(<ConnectionStatus status="failed" />);

        const steps = screen.getByTestId('troubleshooting-steps');
        expect(steps).toBeInTheDocument();
        expect(steps).toHaveTextContent('Check your internet connection');
        expect(steps).toHaveTextContent('Try refreshing the page');
        expect(steps).toHaveTextContent('Contact your instructor if the problem persists');
      });
    });
  });

  describe('Banner variant', () => {
    it('renders banner with correct data-testid', () => {
      render(<ConnectionStatus status="connected" variant="banner" />);

      expect(screen.getByTestId('connection-status-banner')).toBeInTheDocument();
    });

    it('shows Retry Now button in banner for failed state', () => {
      const onReconnect = jest.fn();
      render(
        <ConnectionStatus
          status="failed"
          variant="banner"
          onReconnect={onReconnect}
        />
      );

      const button = screen.getByTestId('reconnect-button');
      expect(button).toBeInTheDocument();
      expect(button).toHaveTextContent('Retry Now');

      fireEvent.click(button);
      expect(onReconnect).toHaveBeenCalledTimes(1);
    });

    it('shows Retry Now button in banner for disconnected state', () => {
      const onReconnect = jest.fn();
      render(
        <ConnectionStatus
          status="disconnected"
          variant="banner"
          onReconnect={onReconnect}
        />
      );

      const button = screen.getByTestId('reconnect-button');
      expect(button).toBeInTheDocument();
      expect(button).toHaveTextContent('Retry Now');
    });

    it('forces banner variant for disconnected state even when badge is specified', () => {
      render(<ConnectionStatus status="disconnected" variant="badge" />);

      // Should render as banner despite badge being specified
      expect(screen.getByTestId('connection-status-banner')).toBeInTheDocument();
      expect(screen.queryByTestId('connection-status')).not.toBeInTheDocument();
    });

    it('forces banner variant for failed state even when badge is specified', () => {
      render(<ConnectionStatus status="failed" variant="badge" />);

      // Should render as banner despite badge being specified
      expect(screen.getByTestId('connection-status-banner')).toBeInTheDocument();
      expect(screen.queryByTestId('connection-status')).not.toBeInTheDocument();
    });

    it('renders troubleshooting steps in banner', () => {
      render(<ConnectionStatus status="failed" variant="banner" />);

      const steps = screen.getByTestId('troubleshooting-steps');
      expect(steps).toBeInTheDocument();
    });
  });

  describe('Connection timeout', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('shows timeout message with elapsed time after threshold is exceeded', () => {
      const connectionStartTime = Date.now() - 15000; // 15 seconds ago

      render(
        <ConnectionStatus
          status="connecting"
          connectionStartTime={connectionStartTime}
          timeoutThreshold={10000}
        />
      );

      // The timeout check runs immediately on mount
      expect(screen.getByText(/Still connecting\.\.\. 15s \/ 10s/)).toBeInTheDocument();
      expect(screen.getByTestId('connection-status-description')).toHaveTextContent(
        'Taking longer than expected. The server may be busy.'
      );
    });

    it('does not show timeout message before threshold', () => {
      const connectionStartTime = Date.now() - 5000; // 5 seconds ago

      render(
        <ConnectionStatus
          status="connecting"
          connectionStartTime={connectionStartTime}
          timeoutThreshold={10000}
        />
      );

      expect(screen.getByText(/Connecting\.\.\. 5s \/ 10s/)).toBeInTheDocument();
      expect(screen.getByTestId('connection-status-description')).toHaveTextContent(
        'Please wait, establishing connection'
      );
    });

    it('updates to timeout message when threshold is crossed', () => {
      const connectionStartTime = Date.now();

      render(
        <ConnectionStatus
          status="connecting"
          connectionStartTime={connectionStartTime}
          timeoutThreshold={10000}
        />
      );

      // Initially shows normal connecting message with 0s elapsed
      expect(screen.getByText(/Connecting\.\.\. 0s \/ 10s/)).toBeInTheDocument();

      // Advance time past threshold
      act(() => {
        jest.advanceTimersByTime(11000);
      });

      // Now shows timeout message with elapsed time
      expect(screen.getByText(/Still connecting\.\.\. 11s \/ 10s/)).toBeInTheDocument();
      expect(screen.getByTestId('connection-status-description')).toHaveTextContent(
        'Taking longer than expected. The server may be busy.'
      );
    });

    it('shows troubleshooting tips when timed out', () => {
      const connectionStartTime = Date.now() - 15000;

      render(
        <ConnectionStatus
          status="connecting"
          connectionStartTime={connectionStartTime}
          timeoutThreshold={10000}
        />
      );

      const steps = screen.getByTestId('troubleshooting-steps');
      expect(steps).toBeInTheDocument();
      expect(steps).toHaveTextContent('Check your internet connection');
      expect(steps).toHaveTextContent('Try refreshing the page');
    });

    it('clears timeout state when status changes from connecting', () => {
      const connectionStartTime = Date.now() - 15000;

      const { rerender } = render(
        <ConnectionStatus
          status="connecting"
          connectionStartTime={connectionStartTime}
          timeoutThreshold={10000}
        />
      );

      expect(screen.getByText(/Still connecting\.\.\./)).toBeInTheDocument();

      // Status changes to connected
      rerender(
        <ConnectionStatus
          status="connected"
          connectionStartTime={null as unknown as number}
          timeoutThreshold={10000}
        />
      );

      expect(screen.getByText('Connected')).toBeInTheDocument();
    });

    it('updates elapsed time every second', () => {
      const connectionStartTime = Date.now();

      render(
        <ConnectionStatus
          status="connecting"
          connectionStartTime={connectionStartTime}
          timeoutThreshold={10000}
        />
      );

      expect(screen.getByText(/Connecting\.\.\. 0s \/ 10s/)).toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(screen.getByText(/Connecting\.\.\. 1s \/ 10s/)).toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(2000);
      });

      expect(screen.getByText(/Connecting\.\.\. 3s \/ 10s/)).toBeInTheDocument();
    });
  });

  describe('Edge cases', () => {
    it('handles unknown status gracefully', () => {
      render(<ConnectionStatus status={'unknown' as ConnectionState} />);

      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });

    it('does not show reconnect button without onReconnect callback', () => {
      render(<ConnectionStatus status="failed" />);

      expect(screen.queryByTestId('reconnect-button')).not.toBeInTheDocument();
    });

    it('handles zero reconnect attempts', () => {
      render(
        <ConnectionStatus
          status="disconnected"
          reconnectAttempt={0}
          maxReconnectAttempts={5}
        />
      );

      expect(screen.getByTestId('connection-status-description')).toHaveTextContent(
        'Connection lost. Attempting to reconnect...'
      );
    });

    it('does not show elapsed time without connectionStartTime', () => {
      render(<ConnectionStatus status="connecting" />);

      expect(screen.getByText('Connecting...')).toBeInTheDocument();
      // Should not show elapsed time format
      expect(screen.queryByText(/\ds \/ \ds/)).not.toBeInTheDocument();
    });
  });

  describe('Specific troubleshooting messages', () => {
    it('shows timeout-specific troubleshooting for timeout errors', () => {
      render(
        <ConnectionStatus
          status="failed"
          error="Connection timeout"
        />
      );

      const steps = screen.getByTestId('troubleshooting-steps');
      expect(steps).toHaveTextContent('The server is taking too long to respond');
      expect(steps).toHaveTextContent('Try refreshing the page');
      expect(steps).toHaveTextContent('Check if the session is still active');
    });

    it('shows server-specific troubleshooting for server unavailable errors', () => {
      render(
        <ConnectionStatus
          status="failed"
          error="Connection refused by server"
        />
      );

      const steps = screen.getByTestId('troubleshooting-steps');
      expect(steps).toHaveTextContent('The server may be temporarily down');
      expect(steps).toHaveTextContent('Wait a moment and try reconnecting');
      expect(steps).toHaveTextContent('Contact your instructor if the problem persists');
    });

    it('shows network-specific troubleshooting for network errors', () => {
      render(
        <ConnectionStatus
          status="failed"
          error="Network error"
        />
      );

      const steps = screen.getByTestId('troubleshooting-steps');
      expect(steps).toHaveTextContent('Check your internet connection');
      expect(steps).toHaveTextContent('Try switching to a different network');
      expect(steps).toHaveTextContent('Disable VPN if enabled');
    });

    it('shows default troubleshooting for generic errors', () => {
      render(
        <ConnectionStatus
          status="failed"
          error="Something went wrong"
        />
      );

      const steps = screen.getByTestId('troubleshooting-steps');
      expect(steps).toHaveTextContent('Check your internet connection');
      expect(steps).toHaveTextContent('Try refreshing the page');
      expect(steps).toHaveTextContent('Contact your instructor if the problem persists');
    });
  });
});
