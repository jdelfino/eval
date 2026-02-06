'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import CreateSessionFromProblemModal from '@/app/(app)/instructor/components/CreateSessionFromProblemModal';
import { getLastUsedSection, setLastUsedSection } from '@/lib/last-used-section';
import { getClassSections } from '@/lib/api/sections';
import { createSession as apiCreateSession } from '@/lib/api/sessions';

interface InstructorActionsProps {
  problem_id: string;
  problem_title: string;
  class_id: string;
  className: string;
}

export default function InstructorActions({ problem_id, problem_title, class_id, className }: InstructorActionsProps) {
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
    const section_id = searchParams.get('section_id');
    if (!shouldStart || !section_id) return;

    autoStartAttempted.current = true;

    (async () => {
      try {
        const session = await apiCreateSession(section_id, problem_id);
        setLastUsedSection(section_id, class_id);
        const channel = new BroadcastChannel('instructor-session-created');
        channel.postMessage({ session_id: session.id, problem_title });
        channel.close();
        router.push(`/public-view?session_id=${session.id}`);
      } catch (err) {
        setAutoStartError(err instanceof Error ? err.message : 'Failed to create session');
      }
    })();
  }, [isLoading, isInstructor, searchParams, problem_id, class_id, problem_title, router]);

  if (isLoading) return null;
  if (!isInstructor) return null;

  const handleSessionCreated = (session_id: string) => {
    const channel = new BroadcastChannel('instructor-session-created');
    channel.postMessage({ session_id, problem_title });
    channel.close();
    router.push(`/public-view?session_id=${session_id}`);
  };

  const createSession = async (section_id: string) => {
    return apiCreateSession(section_id, problem_id);
  };

  const handleStartSession = async () => {
    setStarting(true);
    try {
      const sections = await getClassSections(class_id);

      // Auto-start if only one section
      if (sections.length === 1) {
        const section = sections[0];
        const session = await createSession(section.id);
        setLastUsedSection(section.id, class_id);
        handleSessionCreated(session.id);
        return;
      }

      // Auto-start if last-used section matches this class and exists in sections
      const lastUsed = getLastUsedSection();
      if (lastUsed && lastUsed.class_id === class_id) {
        const matchingSection = sections.find(s => s.id === lastUsed.section_id);
        if (matchingSection) {
          const session = await createSession(matchingSection.id);
          setLastUsedSection(matchingSection.id, class_id);
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
          problem_id={problem_id}
          problem_title={problem_title}
          class_id={class_id}
          className={className}
          onClose={() => setShowModal(false)}
          onSuccess={(session_id) => {
            setShowModal(false);
            handleSessionCreated(session_id);
          }}
        />
      )}
    </>
  );
}
