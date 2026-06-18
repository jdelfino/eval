'use client';

import { useEffect } from 'react';
import { reportError } from '@/lib/api/error-reporting';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';

interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Next.js App Router error boundary (500 surface).
 *
 * Reskinned onto the shared EmptyState (ServerError500AA in v4-empty-error.jsx):
 * danger tone, "500 · …" code badge, "your work is safe" reassurance, and a
 * "Try again" primary that calls `reset()`.
 *
 * Reports the error to the backend on mount. There is no server-returned
 * incident id (reportError resolves to void), so the incident footer surfaces
 * Next.js's `error.digest` when present and is omitted otherwise.
 */
export default function ErrorBoundary({ error, reset }: ErrorBoundaryProps) {
  useEffect(() => {
    reportError(error);
  }, [error]);

  const incidentId = error.digest;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <EmptyState
        code="500 · Something on our end"
        icon="alert"
        tone="danger"
        title="We hit an error loading this page."
        body="Your work is safe — sessions and code drafts persist. Try again, or wait a minute and reload. If you're an instructor mid-session, students stay connected."
        primary={
          <Button variant="accent" onClick={reset}>
            Try again
          </Button>
        }
      />
      {incidentId && (
        <p className="mt-4 font-mono text-xs text-gray-400">
          Incident ID {incidentId} · auto-reported.
        </p>
      )}
    </main>
  );
}
