'use client';

/**
 * Create Session From Problem Modal
 *
 * Modal that allows instructors to create a session from a problem.
 * The class is pre-filled from the problem (read-only). The instructor picks a section.
 *
 * Internals are powered by the shared SessionComposer (section radio rows + the single
 * "Make this the current problem for the class" pointer checkbox + footer). The publish /
 * show-solution UI is supplied via the shared useProblemPublishState hook as the
 * composer's optionsSlot. The modal shell, title, and Cancel/Create wiring are preserved
 * (G7 reskins the shell later).
 *
 * Section rows are sourced from getClassSections(class_id) — RLS-scoped, so co-instructor
 * (non-creator) classes are included. The live "now" pill is keyed on the section's
 * current_session_id (T1 pointer). Student counts come from the instructor dashboard where
 * available; for sections the dashboard does not surface (e.g. co-instructor classes), the
 * row renders without a count (degraded line).
 */

import React, { useState, useEffect } from 'react';
import { getLastUsedSection, setLastUsedSection } from '@/lib/last-used-section';
import { getClassSections } from '@/lib/api/sections';
import { getInstructorDashboard } from '@/lib/api/instructor';
import { createSession } from '@/lib/api/sessions';
import type { Section } from '@/types/api';
import SessionComposer, { ComposerSection } from './SessionComposer';
import { useProblemPublishState } from '../hooks/useProblemPublishState';
import { PublishOptions } from '../hooks/PublishOptions';

interface CreateSessionFromProblemModalProps {
  problem_id: string;
  problem_title: string;
  class_id: string;
  className: string;
  onClose: () => void;
  onSuccess: (session_id: string, join_code: string) => void;
}

export default function CreateSessionFromProblemModal({
  problem_id,
  problem_title,
  class_id,
  className: classDisplayName,
  onClose,
  onSuccess,
}: CreateSessionFromProblemModalProps) {
  const [sections, setSections] = useState<Section[]>([]);
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>({});
  const [selectedSectionId, setSelectedSectionId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const publish = useProblemPublishState(problem_id, selectedSectionId || null);

  useEffect(() => {
    loadSections(class_id);
    loadStudentCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [class_id, problem_id]);

  const loadSections = async (targetClassId: string) => {
    try {
      const loadedSections = await getClassSections(targetClassId);
      setSections(loadedSections);

      // Pre-select last-used section if it matches this class
      const lastUsed = getLastUsedSection();
      if (lastUsed && lastUsed.class_id === targetClassId) {
        const match = loadedSections.find(s => s.id === lastUsed.section_id);
        if (match) {
          setSelectedSectionId(match.id);
          return;
        }
      }
      setSelectedSectionId('');
    } catch (err) {
      console.error('Error loading sections:', err);
      setError(err instanceof Error ? err.message : 'Failed to load sections');
    }
  };

  // Student counts come from the instructor dashboard where available. Sections from
  // co-instructor classes may be absent here — those rows degrade to no count.
  const loadStudentCounts = async () => {
    try {
      const dashboard = await getInstructorDashboard();
      const counts: Record<string, number> = {};
      for (const cls of dashboard.classes) {
        for (const sec of cls.sections) {
          counts[sec.id] = sec.studentCount;
        }
      }
      setStudentCounts(counts);
    } catch (err) {
      console.error('Error loading student counts:', err);
      // Non-fatal — rows just render without counts (degraded line).
    }
  };

  const handleStart = async ({ setCurrent }: { setCurrent: boolean }) => {
    if (!selectedSectionId) {
      setError('Please select a section');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const session = await createSession(
        selectedSectionId,
        problem_id,
        publish.showSolutionArg,
        { setCurrent }
      );
      setLastUsedSection(selectedSectionId, class_id);
      const selectedSection = sections.find(s => s.id === selectedSectionId);
      onSuccess(session.id, selectedSection?.join_code || '');
    } catch (err) {
      console.error('Error creating session:', err);
      setError(err instanceof Error ? err.message : 'Failed to create session');
    } finally {
      setLoading(false);
    }
  };

  const composerSections: ComposerSection[] = sections.map(s => ({
    id: s.id,
    label: s.name,
    studentCount: studentCounts[s.id],
    hasCurrentSession: !!s.current_session_id,
  }));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Create Session</h2>
            <p className="text-sm text-gray-600 mt-1">
              From problem: <span className="font-medium">{problem_title}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={loading}
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Class (read-only — problem belongs to this class) */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Class</label>
          <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-gray-900">
            {classDisplayName}
          </div>
        </div>

        <SessionComposer
          sections={composerSections}
          selectedSectionId={selectedSectionId || null}
          onSelectSection={setSelectedSectionId}
          optionsSlot={<PublishOptions publish={publish} active={!!selectedSectionId} />}
          onStart={handleStart}
          onCancel={onClose}
          starting={loading}
          error={error}
        />
      </div>
    </div>
  );
}
