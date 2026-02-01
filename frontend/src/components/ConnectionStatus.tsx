'use client';

import React, { useState, useEffect, useCallback } from 'react';

export type ConnectionState = 'connected' | 'connecting' | 'disconnected' | 'failed';

export interface ConnectionStatusProps {
  /** Current connection status */
  status: ConnectionState;
  /** Optional error message to display */
  error?: string | null;
  /** Callback to attempt manual reconnection */
  onReconnect?: () => void;
  /** Whether reconnection is currently in progress */
  isReconnecting?: boolean;
  /** Current reconnection attempt number (1-indexed) */
  reconnectAttempt?: number;
  /** Maximum reconnection attempts before giving up */
  maxReconnectAttempts?: number;
  /** Time in ms when connection started (for timeout detection) */
  connectionStartTime?: number;
  /** Timeout threshold in ms (default: 10000) */
  timeoutThreshold?: number;
  /** Display style: 'badge' for compact header display, 'banner' for full-width notification.
   *  Note: disconnected and failed states always use banner variant for visibility. */
  variant?: 'badge' | 'banner';
}

/**
 * ConnectionStatus component - displays connection state with actionable guidance
 *
 * Features:
 * - Visual indicator for each connection state
 * - Descriptive messages explaining current state
 * - Actionable guidance (e.g., "Click to reconnect")
 * - Reconnection attempt counter
 * - Timeout detection with guidance
 * - Manual reconnect button for failed state
 */
export function ConnectionStatus({
  status,
  error,
  onReconnect,
  isReconnecting = false,
  reconnectAttempt = 0,
  maxReconnectAttempts = 5,
  connectionStartTime,
  timeoutThreshold = 10000,
  variant = 'badge',
}: ConnectionStatusProps) {
  const [isTimedOut, setIsTimedOut] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Track elapsed time and detect timeout during connecting
  useEffect(() => {
    if (status !== 'connecting' || !connectionStartTime) {
      setIsTimedOut(false);
      setElapsedSeconds(0);
      return;
    }

    const updateElapsedTime = () => {
      const elapsed = Date.now() - connectionStartTime;
      const seconds = Math.floor(elapsed / 1000);
      setElapsedSeconds(seconds);
      if (elapsed >= timeoutThreshold) {
        setIsTimedOut(true);
      }
    };

    // Check immediately and then set up interval
    updateElapsedTime();
    const interval = setInterval(updateElapsedTime, 1000);

    return () => clearInterval(interval);
  }, [status, connectionStartTime, timeoutThreshold]);

  // Force banner variant for disconnected/failed states for visibility
  const effectiveVariant = (status === 'disconnected' || status === 'failed') ? 'banner' : variant;

  // Format elapsed time display for connecting state
  const getElapsedTimeDisplay = () => {
    if (!connectionStartTime) return '';
    const timeoutSeconds = Math.floor(timeoutThreshold / 1000);
    return ` ${elapsedSeconds}s / ${timeoutSeconds}s`;
  };

  // Get specific troubleshooting steps based on error type
  const getTroubleshootingSteps = (errorMsg?: string | null): string[] => {
    if (errorMsg?.toLowerCase().includes('timeout')) {
      return [
        'The server is taking too long to respond',
        'Try refreshing the page',
        'Check if the session is still active',
      ];
    }
    if (errorMsg?.toLowerCase().includes('refused') || errorMsg?.toLowerCase().includes('unavailable')) {
      return [
        'The server may be temporarily down',
        'Wait a moment and try reconnecting',
        'Contact your instructor if the problem persists',
      ];
    }
    if (errorMsg?.toLowerCase().includes('network') || errorMsg?.toLowerCase().includes('internet')) {
      return [
        'Check your internet connection',
        'Try switching to a different network',
        'Disable VPN if enabled',
      ];
    }
    // Default troubleshooting steps
    return [
      'Check your internet connection',
      'Try refreshing the page',
      'Contact your instructor if the problem persists',
    ];
  };

  const getStatusConfig = useCallback(() => {
    switch (status) {
      case 'connected':
        return {
          icon: <span aria-hidden="true" className="text-green-600">&#9679;</span>,
          label: 'Connected',
          description: null,
          troubleshootingSteps: null,
          bgColor: '#d4edda',
          textColor: '#155724',
          borderColor: '#c3e6cb',
        };
      case 'connecting': {
        const elapsedDisplay = connectionStartTime ? getElapsedTimeDisplay() : '';
        return {
          icon: <span aria-hidden="true" className="text-yellow-600">&#9675;</span>,
          label: isTimedOut ? `Still connecting...${elapsedDisplay}` : `Connecting...${elapsedDisplay}`,
          description: isTimedOut
            ? 'Taking longer than expected. The server may be busy.'
            : 'Please wait, establishing connection',
          troubleshootingSteps: isTimedOut ? ['Check your internet connection', 'Try refreshing the page'] : null,
          bgColor: '#fff3cd',
          textColor: '#856404',
          borderColor: '#ffeaa7',
        };
      }
      case 'disconnected':
        return {
          icon: <span aria-hidden="true" className="text-red-600">&#9679;</span>,
          label: 'Disconnected',
          description: reconnectAttempt > 0
            ? `Reconnecting (attempt ${reconnectAttempt} of ${maxReconnectAttempts})...`
            : 'Connection lost. Attempting to reconnect...',
          troubleshootingSteps: reconnectAttempt >= 2
            ? ['Check your internet connection', 'The server may be temporarily unavailable']
            : null,
          bgColor: '#f8d7da',
          textColor: '#721c24',
          borderColor: '#f5c6cb',
          showReconnect: true,
        };
      case 'failed':
        return {
          icon: <span aria-hidden="true" className="text-red-600">&#10005;</span>,
          label: 'Connection Failed',
          description: error || 'Unable to establish connection to the server.',
          troubleshootingSteps: getTroubleshootingSteps(error),
          bgColor: '#f8d7da',
          textColor: '#721c24',
          borderColor: '#f5c6cb',
          showReconnect: true,
        };
      default:
        return {
          icon: null,
          label: 'Unknown',
          description: null,
          troubleshootingSteps: null,
          bgColor: '#e2e3e5',
          textColor: '#383d41',
          borderColor: '#d6d8db',
        };
    }
  }, [status, error, reconnectAttempt, maxReconnectAttempts, isTimedOut, connectionStartTime, elapsedSeconds, timeoutThreshold]);

  const config = getStatusConfig();

  // Render troubleshooting steps if present
  const renderTroubleshootingSteps = () => {
    if (!config.troubleshootingSteps || config.troubleshootingSteps.length === 0) {
      return null;
    }
    return (
      <ul
        data-testid="troubleshooting-steps"
        style={{
          margin: '0.5rem 0 0 0',
          paddingLeft: '1.25rem',
          fontSize: '0.8rem',
          color: config.textColor,
          opacity: 0.85,
        }}
      >
        {config.troubleshootingSteps.map((step, index) => (
          <li key={index} style={{ marginBottom: '0.25rem' }}>{step}</li>
        ))}
      </ul>
    );
  };

  // Render retry button for disconnected/failed states
  const renderRetryButton = (size: 'small' | 'normal' = 'normal') => {
    if (!onReconnect) return null;
    if (status !== 'disconnected' && status !== 'failed') return null;

    const isSmall = size === 'small';
    return (
      <button
        onClick={onReconnect}
        disabled={isReconnecting}
        data-testid="reconnect-button"
        style={{
          marginTop: isSmall ? '0.25rem' : '0',
          padding: isSmall ? '0.25rem 0.5rem' : '0.5rem 1rem',
          fontSize: isSmall ? '0.75rem' : '0.875rem',
          backgroundColor: 'white',
          border: `1px solid ${config.borderColor}`,
          borderRadius: isSmall ? '3px' : '4px',
          cursor: isReconnecting ? 'not-allowed' : 'pointer',
          color: config.textColor,
          fontWeight: 500,
          opacity: isReconnecting ? 0.6 : 1,
        }}
      >
        {isReconnecting ? 'Reconnecting...' : 'Retry Now'}
      </button>
    );
  };

  if (effectiveVariant === 'badge') {
    return (
      <div
        data-testid="connection-status"
        data-status={status}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          padding: '0.5rem 1rem',
          backgroundColor: config.bgColor,
          borderRadius: '4px',
          fontSize: '0.9rem',
          gap: '0.25rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {config.icon}
          <span style={{ fontWeight: 500, color: config.textColor }}>
            {config.label}
          </span>
        </div>
        {config.description && (
          <span
            data-testid="connection-status-description"
            style={{
              fontSize: '0.75rem',
              color: config.textColor,
              opacity: 0.9,
            }}
          >
            {config.description}
          </span>
        )}
        {renderTroubleshootingSteps()}
        {renderRetryButton('small')}
      </div>
    );
  }

  // Banner variant - full width notification
  return (
    <div
      data-testid="connection-status-banner"
      data-status={status}
      style={{
        padding: '0.75rem 1rem',
        backgroundColor: config.bgColor,
        borderRadius: '4px',
        border: `1px solid ${config.borderColor}`,
        marginBottom: '1rem',
      }}
    >
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        gap: '0.5rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', flex: 1 }}>
          <span style={{ marginTop: '0.125rem' }}>{config.icon}</span>
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 500, color: config.textColor }}>
              {config.label}
            </span>
            {config.description && (
              <p
                data-testid="connection-status-description"
                style={{
                  margin: '0.25rem 0 0 0',
                  fontSize: '0.875rem',
                  color: config.textColor,
                  opacity: 0.9,
                }}
              >
                {config.description}
              </p>
            )}
            {renderTroubleshootingSteps()}
          </div>
        </div>
        {renderRetryButton('normal')}
      </div>
    </div>
  );
}

export default ConnectionStatus;
