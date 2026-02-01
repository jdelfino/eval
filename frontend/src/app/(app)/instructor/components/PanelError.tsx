'use client';

/**
 * Error boundary fallback component for collapsible panels.
 * Provides a simple error display with retry functionality.
 */

import React from 'react';
import { Button } from '@/components/ui/Button';

interface PanelErrorProps {
  /** Panel title for context in error message */
  title: string;
  /** Optional error message to display */
  error?: string;
  /** Callback to reset the error boundary and retry */
  onRetry?: () => void;
}

/**
 * PanelError - Fallback UI for panel error boundaries.
 * Shows a clean error state with optional retry button.
 */
export function PanelError({
  title,
  error,
  onRetry,
}: PanelErrorProps) {
  return (
    <div
      className="p-4 bg-red-50 border border-red-200 rounded-lg"
      role="alert"
      data-testid={`panel-error-${title.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          <svg
            className="h-5 w-5 text-red-500"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-red-800 m-0">
            {title} failed to load
          </h3>
          {error && (
            <p className="mt-1 text-sm text-red-700 m-0">
              {error}
            </p>
          )}
        </div>
      </div>
      {onRetry && (
        <div className="mt-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={onRetry}
          >
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Generic error boundary wrapper for panels.
 * Use this to wrap panel content to catch and display errors.
 */
export class PanelErrorBoundary extends React.Component<
  {
    title: string;
    children: React.ReactNode;
    fallback?: React.ReactNode;
  },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { title: string; children: React.ReactNode; fallback?: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[PanelErrorBoundary] ${this.props.title}:`, error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <PanelError
          title={this.props.title}
          error={this.state.error?.message}
          onRetry={this.handleRetry}
        />
      );
    }

    return this.props.children;
  }
}
