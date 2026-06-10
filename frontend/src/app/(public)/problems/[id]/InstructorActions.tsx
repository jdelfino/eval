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
  class_id: string | null;
  className: string;
}

export default function InstructorActions({ problem_id, problem_title, class_id, className }: InstructorActionsProps) {
  const { user, isLoading } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [starting, setStarting] = useState(false);
  const [autoStartError, setAutoStartError] = useState<string | null>(null);
  // Trampoline mode: after auto-starting, show "close this tab" instead of navigating
  const [showCloseTab, setShowCloseTab] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoStartAttempted = useRef(false);

  const isInstructor = !isLoading && user && ['instructor', 'namespace-admin', 'system-admin'].includes(user.role);

  useEffect(() => {
    if (isLoading || autoStartAttempted.current) return;
    if (!isInstructor) return;
    if (!class_id) return;

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
        // Trampoline behavior: show "close this tab" instead of navigating.
        // The projector tab at /public-view?section_id=X will auto-follow
        // the new session via the section channel.
        setShowCloseTab(true);
      } catch (err) {
        setAutoStartError(err instanceof Error ? err.message : 'Failed to create session');
      }
    })();
  }, [isLoading, isInstructor, searchParams, problem_id, class_id, problem_title, router]);

  if (isLoading) return null;
  if (!isInstructor) return null;
  if (!class_id) return null;

  // Show trampoline UI after auto-start
  if (showCloseTab) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12, marginBottom: 24 }}>
        <p style={{ fontSize: 13, color: 'var(--run)', fontWeight: 500 }}>Session started successfully.</p>
        <p style={{ fontSize: 13, color: 'var(--fg-muted)' }}>You may close this tab.</p>
      </div>
    );
  }

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button
          onClick={handleStartSession}
          disabled={starting}
          style={{
            height: 36,
            padding: '0 20px',
            background: 'var(--accent)',
            color: 'var(--accent-fg)',
            border: 'none',
            borderRadius: 'var(--radius)',
            fontSize: 13.5,
            fontWeight: 600,
            cursor: starting ? 'not-allowed' : 'pointer',
            opacity: starting ? 0.5 : 1,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {starting ? (
            <>
              <svg
                style={{ animation: 'spin 1s linear infinite', height: 14, width: 14 }}
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Starting...
            </>
          ) : (
            'Start Session'
          )}
        </button>
      </div>
      {autoStartError && (
        <p style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 16 }}>{autoStartError}</p>
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
