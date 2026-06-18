'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { listMySections } from '@/lib/api/sections';
import { getOrCreateStudentWork } from '@/lib/api/student-work';
import { Button } from '@/components/ui/Button';
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
        <Button
          variant="accent"
          size="md"
          onClick={() => handleStartPractice()}
          loading={starting}
          disabled={starting}
        >
          Practice
        </Button>
      </div>
      {error && (
        <p className="text-danger" style={{ fontSize: 13, marginBottom: 16 }}>{error}</p>
      )}
      {showPicker && (
        <div
          className="bg-bg-raised border border-border"
          style={{
            marginBottom: 24,
            padding: 16,
            borderRadius: 'var(--radius-lg)',
          }}
        >
          <p className="text-fg-muted" style={{ fontSize: 13, marginBottom: 12 }}>
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
                className="bg-bg border border-border text-fg"
                style={{
                  padding: '8px 12px',
                  fontSize: 13,
                  textAlign: 'left',
                  borderRadius: 'var(--radius)',
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
