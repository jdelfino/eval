'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import CreateSessionFromProblemModal from '@/app/(app)/instructor/components/CreateSessionFromProblemModal';
import { getLastUsedSection, setLastUsedSection } from '@/lib/last-used-section';

interface InstructorActionsProps {
  problemId: string;
  problemTitle: string;
  classId: string;
  className: string;
}

export default function InstructorActions({ problemId, problemTitle, classId, className }: InstructorActionsProps) {
  const { user, isLoading } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [starting, setStarting] = useState(false);
  const [autoStartError, setAutoStartError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoStartAttempted = useRef(false);

  const isInstructor = !isLoading && user && ['instructor', 'namespace-admin', 'system-admin'].includes(user.role);

  useEffect(() => {
    if (isLoading || autoStartAttempted.current) return;
    if (!isInstructor) return;

    const shouldStart = searchParams.get('start') === 'true';
    const sectionId = searchParams.get('sectionId');
    if (!shouldStart || !sectionId) return;

    autoStartAttempted.current = true;

    (async () => {
      try {
        const response = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sectionId, problemId }),
        });
        if (!response.ok) {
          throw new Error('Failed to create session');
        }
        const { session } = await response.json();
        setLastUsedSection(sectionId, classId);
        const channel = new BroadcastChannel('instructor-session-created');
        channel.postMessage({ sessionId: session.id, problemTitle });
        channel.close();
        router.push(`/public-view?sessionId=${session.id}`);
      } catch (err) {
        setAutoStartError(err instanceof Error ? err.message : 'Failed to create session');
      }
    })();
  }, [isLoading, isInstructor, searchParams, problemId, classId, problemTitle, router]);

  if (isLoading) return null;
  if (!isInstructor) return null;

  const handleSessionCreated = (sessionId: string) => {
    const channel = new BroadcastChannel('instructor-session-created');
    channel.postMessage({ sessionId, problemTitle });
    channel.close();
    router.push(`/public-view?sessionId=${sessionId}`);
  };

  const createSession = async (sectionId: string) => {
    const response = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sectionId, problemId }),
    });
    if (!response.ok) {
      throw new Error('Failed to create session');
    }
    const { session } = await response.json();
    return session;
  };

  const handleStartSession = async () => {
    setStarting(true);
    try {
      const response = await fetch(`/api/classes/${classId}/sections`);
      if (!response.ok) {
        throw new Error('Failed to load sections');
      }
      const data = await response.json();
      const sections: { id: string; name: string; joinCode: string }[] = data.sections || [];

      // Auto-start if only one section
      if (sections.length === 1) {
        const section = sections[0];
        const session = await createSession(section.id);
        setLastUsedSection(section.id, classId);
        handleSessionCreated(session.id);
        return;
      }

      // Auto-start if last-used section matches this class and exists in sections
      const lastUsed = getLastUsedSection();
      if (lastUsed && lastUsed.classId === classId) {
        const matchingSection = sections.find(s => s.id === lastUsed.sectionId);
        if (matchingSection) {
          const session = await createSession(matchingSection.id);
          setLastUsedSection(matchingSection.id, classId);
          handleSessionCreated(session.id);
          return;
        }
      }

      // Otherwise open modal
      setShowModal(true);
    } catch {
      // On error, fall back to modal
      setShowModal(true);
    } finally {
      setStarting(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={handleStartSession}
          disabled={starting}
          className="px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
        >
          {starting ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Starting...
            </span>
          ) : (
            'Start Session'
          )}
        </button>
      </div>
      {autoStartError && (
        <p className="text-sm text-red-600 mb-4">{autoStartError}</p>
      )}
      {showModal && (
        <CreateSessionFromProblemModal
          problemId={problemId}
          problemTitle={problemTitle}
          classId={classId}
          className={className}
          onClose={() => setShowModal(false)}
          onSuccess={(sessionId) => {
            setShowModal(false);
            handleSessionCreated(sessionId);
          }}
        />
      )}
    </>
  );
}
