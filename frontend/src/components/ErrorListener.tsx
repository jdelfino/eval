'use client';

import { useEffect } from 'react';
import { reportError } from '@/lib/api/error-reporting';

/**
 * Registers global window error listeners to capture unhandled exceptions
 * and unhandled promise rejections, forwarding them to the error reporting API.
 *
 * Renders nothing. Mount once in the root layout.
 */
export function ErrorListener() {
  useEffect(() => {
    function handleError(event: ErrorEvent) {
      const error = event.error instanceof Error ? event.error : new Error(event.message);
      void reportError(error, { type: 'uncaught_exception' });
    }

    function handleUnhandledRejection(event: PromiseRejectionEvent) {
      const error =
        event.reason instanceof Error
          ? event.reason
          : new Error(String(event.reason ?? 'Unhandled promise rejection'));
      void reportError(error, { type: 'unhandled_rejection' });
    }

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return null;
}
