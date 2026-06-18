'use client';

/**
 * SessionLaunchStrip — post-launch confirmation strip.
 *
 * Shown once on the instructor session page immediately after a session is
 * created (gated by the `session-launched:{id}` sessionStorage flag). Mirrors
 * the v4 `InstrSessionLive` artboard toast: a run-soft gradient bar with a ✓
 * roundel, a headline, and quiet actions (Copy code, Cast to projector,
 * Dismiss).
 *
 * Per locked decision G4-5 there is NO notified-count subline (not derivable).
 */

import React, { useCallback, useState } from 'react';
import { openPublicView } from '@/lib/public-view';

interface SessionLaunchStripProps {
  /** Section display name (e.g. "CS 101 · Period 3"). */
  sectionName: string;
  /** Mono join code shown in the Copy action. */
  joinCode: string;
  /** Session id used for the "Cast to projector" public-view window. */
  sessionId: string;
  /**
   * Whether this session became the section's current problem (set_current).
   * Controls the " — students see it now" headline suffix.
   */
  madeCurrent: boolean;
  /** Called when the instructor dismisses the strip. */
  onDismiss: () => void;
}

export default function SessionLaunchStrip({
  sectionName,
  joinCode,
  sessionId,
  madeCurrent,
  onDismiss,
}: SessionLaunchStripProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyCode = useCallback(async () => {
    if (!joinCode) return;
    try {
      await navigator.clipboard.writeText(joinCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be unavailable (permissions / older browsers). The code
      // is still visible in the button label, so this is non-fatal.
    }
  }, [joinCode]);

  const handleCast = useCallback(() => {
    openPublicView(sessionId);
  }, [sessionId]);

  return (
    <div
      data-testid="session-launch-strip"
      className="flex items-center gap-3.5 px-6 py-3.5 border-b border-green-200 bg-gradient-to-b from-green-50 to-white"
    >
      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-green-600 text-sm font-bold text-white">
        ✓
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-gray-900">
          Session started for {sectionName}
          {madeCurrent ? ' — students see it now' : ''}
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          onClick={handleCopyCode}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
          data-testid="session-launch-strip-copy"
        >
          {copied ? '✓ Copied' : (
            <>
              📋 Copy code · <span className="font-mono font-semibold">{joinCode}</span>
            </>
          )}
        </button>
        <button
          onClick={handleCast}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
          data-testid="session-launch-strip-cast"
        >
          📺 Cast to projector
        </button>
        <button
          onClick={onDismiss}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100 transition-colors"
          data-testid="session-launch-strip-dismiss"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
