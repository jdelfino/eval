'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { listMySections } from '@/lib/api/sections';
import { getOrCreateStudentWork } from '@/lib/api/student-work';
import type { MySectionInfo } from '@/types/api';

interface StudentActionsProps {
  problem_id: string;
  class_id: string | null;
}

export default function StudentActions({ problem_id, class_id }: StudentActionsProps) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matchingSections, setMatchingSections] = useState<MySectionInfo[] | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const isStudent = !isLoading && user && user.role === 'student';

  // Fetch student's matching sections for this class
  useEffect(() => {
    if (!isStudent) return;
    if (!class_id) {
      setMatchingSections([]);
      return;
    }

    listMySections()
      .then((sections) => {
        const matching = sections.filter((s) => s.section.class_id === class_id);
        setMatchingSections(matching);
      })
      .catch(() => {
        setMatchingSections([]);
      });
  }, [isStudent, class_id]);

  if (isLoading || !isStudent || matchingSections === null || matchingSections.length === 0) {
    return null;
  }

  const handleStartPractice = async (sectionId?: string) => {
    setStarting(true);
    setError(null);

    try {
      // Auto-select if one section, otherwise use provided sectionId
      const targetSectionId = sectionId || (matchingSections.length === 1 ? matchingSections[0].section.id : null);

      if (!targetSectionId) {
        // Show picker for multiple sections
        setShowPicker(true);
        setStarting(false);
        return;
      }

      const work = await getOrCreateStudentWork(targetSectionId, problem_id);
      router.push(`/student?work_id=${work.id}&section_id=${targetSectionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start practice');
      setStarting(false);
    }
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button
          onClick={() => handleStartPractice()}
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
            'Practice'
          )}
        </button>
      </div>
      {error && (
        <p style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 16 }}>{error}</p>
      )}
      {showPicker && (
        <div
          style={{
            marginBottom: 24,
            padding: 16,
            background: 'var(--bg-raised)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border)',
          }}
        >
          <p style={{ fontSize: 13, color: 'var(--fg-muted)', marginBottom: 12 }}>
            Select a section to practice in:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {matchingSections.map((s) => (
              <button
                key={s.section.id}
                onClick={() => {
                  setShowPicker(false);
                  handleStartPractice(s.section.id);
                }}
                disabled={starting}
                style={{
                  padding: '8px 12px',
                  fontSize: 13,
                  textAlign: 'left',
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--fg)',
                  cursor: starting ? 'not-allowed' : 'pointer',
                  opacity: starting ? 0.5 : 1,
                }}
              >
                {s.section.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
