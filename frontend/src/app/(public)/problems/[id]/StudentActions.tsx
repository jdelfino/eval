'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { listMySections } from '@/lib/api/sections';
import { getOrCreateStudentWork } from '@/lib/api/student-work';
import type { MySectionInfo } from '@/types/api';

interface StudentActionsProps {
  problem_id: string;
  class_id: string;
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
      router.push(`/student?work_id=${work.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start practice');
      setStarting(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => handleStartPractice()}
          disabled={starting}
          className="px-4 py-2 text-sm bg-green-600 text-white hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50"
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
            'Practice'
          )}
        </button>
      </div>
      {error && (
        <p className="text-sm text-red-600 mb-4">{error}</p>
      )}
      {showPicker && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg border">
          <p className="text-sm text-gray-700 mb-3">Select a section to practice in:</p>
          <div className="flex flex-col gap-2">
            {matchingSections.map((s) => (
              <button
                key={s.section.id}
                onClick={() => {
                  setShowPicker(false);
                  handleStartPractice(s.section.id);
                }}
                disabled={starting}
                className="px-3 py-2 text-sm text-left bg-white border rounded hover:bg-gray-50 transition-colors disabled:opacity-50"
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
