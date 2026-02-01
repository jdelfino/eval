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

  if (!state.session_id || !state.join_code) {
    return null;
  }

  return (
    <Link
      href={`/student?session_id=${state.session_id}`}
      className="flex items-center gap-2 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium hover:bg-green-200 transition-colors"
    >
      <Play className="h-4 w-4" aria-hidden="true" />
      <span>Active Session: {state.join_code}</span>
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}
