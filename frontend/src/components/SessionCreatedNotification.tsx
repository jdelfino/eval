'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface SessionNotification {
  sessionId: string;
  problemTitle: string;
}

export default function SessionCreatedNotification() {
  const [notification, setNotification] = useState<SessionNotification | null>(null);

  useEffect(() => {
    const channel = new BroadcastChannel('instructor-session-created');
    channel.onmessage = (event: MessageEvent<SessionNotification>) => {
      setNotification(event.data);
    };
    return () => channel.close();
  }, []);

  if (!notification) return null;

  return (
    <div
      className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between"
      data-testid="session-created-notification"
    >
      <div className="flex items-center gap-3">
        <svg className="w-5 h-5 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-blue-800 font-medium">
          New session started for {notification.problemTitle}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href={`/instructor/session/${notification.sessionId}`}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          Go to Session Dashboard
        </Link>
        <button
          onClick={() => setNotification(null)}
          className="p-1 text-blue-400 hover:text-blue-600 transition-colors"
          aria-label="Dismiss"
          data-testid="dismiss-notification"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
