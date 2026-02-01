'use client';

/**
 * Banner component showing link to active session.
 * Displays when user has an active session from ActiveSessionContext.
 */

import Link from 'next/link';
import { Play, ArrowRight } from 'lucide-react';
import { useActiveSession } from '@/contexts/ActiveSessionContext';

export function ActiveSessionBanner() {
  const { state } = useActiveSession();

  if (!state.sessionId || !state.joinCode) {
    return null;
  }

  return (
    <Link
      href={`/student?sessionId=${state.sessionId}`}
      className="flex items-center gap-2 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium hover:bg-green-200 transition-colors"
    >
      <Play className="h-4 w-4" aria-hidden="true" />
      <span>Active Session: {state.joinCode}</span>
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}
